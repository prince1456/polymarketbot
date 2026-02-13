import { ClobClient } from '@polymarket/clob-client';
import { ethers } from 'ethers';
import { AppConfig, Position, Trade, TradeExecutionResult, UserBalance } from './types.js';
import { DatabaseManager } from './database.js';
import { RiskManager } from './risk.js';

export class TradeExecutor {
  private config: AppConfig;
  private client: ClobClient;
  private db: DatabaseManager;
  private risk: RiskManager;
  private wallet: ethers.Wallet;

  // Cached target portfolio value (refreshed periodically)
  private cachedTargetBalance: number = 0;
  private targetBalanceFetchedAt: number = 0;
  private readonly TARGET_BALANCE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(
    config: AppConfig,
    db: DatabaseManager,
    risk: RiskManager,
    wallet: ethers.Wallet
  ) {
    this.config = config;
    this.db = db;
    this.risk = risk;
    this.wallet = wallet;

    const host = config.polymarketApiUrl || 'https://clob.polymarket.com';
    // Initialize CLOB client with wallet for signing orders
    this.client = new ClobClient(host, 137, wallet as any);

    console.log('Trade Executor initialized');
  }

  public async executePositionCopy(targetPosition: Position): Promise<TradeExecutionResult> {
    try {
      console.log(`\n=== Executing Position Copy ===`);
      console.log(`Market: ${targetPosition.marketId}`);
      console.log(`Outcome: ${targetPosition.outcome}`);
      console.log(`Target Size: ${targetPosition.size} @ $${targetPosition.price.toFixed(2)}`);

      // Step 1: Calculate our position size using ratio-based proportional sizing
      const ourSize = await this.calculateProportionalSize(targetPosition);

      if (ourSize < 0.01) {
        console.log(`Calculated trade size $${ourSize.toFixed(4)} is too small, skipping`);
        return {
          success: false,
          error: 'Calculated trade size too small (< $0.01)',
        };
      }

      console.log(`Our Size: $${ourSize.toFixed(2)}`);

      // Step 2: Fetch orderbook for liquidity check
      const orderBookData = await this.client.getOrderBook(targetPosition.outcomeId);

      // Convert to our OrderBook type
      const orderBook = orderBookData ? {
        bids: orderBookData.bids || [],
        asks: orderBookData.asks || [],
        timestamp: Date.now(),
      } : undefined;

      // Step 3: Validate with risk manager
      const validation = await this.risk.validateTrade(ourSize, orderBook);

      if (!validation.approved) {
        console.log(`Trade rejected: ${validation.reason}`);
        return {
          success: false,
          error: validation.reason,
        };
      }

      console.log('Risk checks passed ✓');

      // Step 4: Execute trade (or simulate in dry run)
      if (this.config.dryRun) {
        console.log('DRY RUN MODE - Trade simulated but not executed');
        return this.simulateTrade(targetPosition, ourSize);
      }

      // Step 5: Place actual order
      const result = await this.placeOrder(targetPosition, ourSize);

      if (result.success) {
        // Step 6: Log to database
        const trade: Trade = {
          marketId: targetPosition.marketId,
          outcome: targetPosition.outcome,
          targetAmount: targetPosition.value,
          ourAmount: ourSize,
          price: targetPosition.price,
          timestamp: new Date(),
          txHash: result.txHash,
        };

        this.db.logTrade(trade);
        console.log('Trade logged to database ✓');
      }

      console.log('===============================\n');
      return result;
    } catch (error) {
      console.error('Error executing position copy:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Ratio-based proportional sizing:
   *   ratio = target_trade_value / target_total_balance
   *   our_trade_size = our_balance * ratio
   *
   * Example: target has 200k, trades $2000 (1% of portfolio)
   *          we have $200, so we trade $2 (1% of our portfolio)
   *
   * If TARGET_BALANCE=0 (default), auto-fetches the target's total
   * portfolio value (on-chain USDC + Polymarket position values).
   */
  private async calculateProportionalSize(targetPosition: Position): Promise<number> {
    try {
      const ourBalance = await this.risk.getBalance();
      const targetTradeValue = targetPosition.value;

      // Get target's total balance (manual override or auto-fetch)
      const targetTotalBalance = await this.getTargetBalance();

      if (targetTotalBalance <= 0) {
        console.log('  WARNING: Could not determine target balance, skipping trade');
        return 0;
      }

      // Calculate what ratio of the target's portfolio this trade represents
      const ratio = targetTradeValue / targetTotalBalance;

      // Apply the same ratio to our balance
      let ourTradeSize = ourBalance.available * ratio;

      const source = this.config.targetBalance > 0 ? 'manual' : 'auto-fetched';
      console.log(`  Ratio calculation:`);
      console.log(`    Target balance: $${targetTotalBalance.toLocaleString()} (${source})`);
      console.log(`    Target trade: $${targetTradeValue.toFixed(2)} / $${targetTotalBalance.toLocaleString()} = ${(ratio * 100).toFixed(4)}%`);
      console.log(`    Our balance: $${ourBalance.available.toFixed(2)}`);
      console.log(`    Our trade: $${ourTradeSize.toFixed(2)}`);

      // Cap at max trade size
      if (ourTradeSize > this.config.maxTradeSize) {
        console.log(`    Capped from $${ourTradeSize.toFixed(2)} to max trade size $${this.config.maxTradeSize}`);
        ourTradeSize = this.config.maxTradeSize;
      }

      return ourTradeSize;
    } catch (error) {
      console.error('Error calculating proportional size:', error);
      throw error;
    }
  }

  /**
   * Returns the target's total balance. Uses manual config value if set,
   * otherwise auto-fetches from chain (USDC) + Polymarket positions.
   * Result is cached for 5 minutes to avoid spamming APIs.
   */
  private async getTargetBalance(): Promise<number> {
    // If manually configured, use that
    if (this.config.targetBalance > 0) {
      return this.config.targetBalance;
    }

    // Check cache
    const now = Date.now();
    if (this.cachedTargetBalance > 0 && (now - this.targetBalanceFetchedAt) < this.TARGET_BALANCE_CACHE_TTL) {
      return this.cachedTargetBalance;
    }

    // Auto-fetch: on-chain USDC + sum of position values
    console.log('  Fetching target portfolio value...');

    const [usdcBalance, positionsValue] = await Promise.all([
      this.risk.getUsdcBalanceOf(this.config.targetWallet),
      this.fetchTargetPositionsValue(),
    ]);

    const total = usdcBalance + positionsValue;

    console.log(`    Target USDC on-chain: $${usdcBalance.toLocaleString()}`);
    console.log(`    Target positions value: $${positionsValue.toLocaleString()}`);
    console.log(`    Target total portfolio: $${total.toLocaleString()}`);

    // Cache result
    this.cachedTargetBalance = total;
    this.targetBalanceFetchedAt = now;

    return total;
  }

  /**
   * Fetches all of the target's Polymarket positions and sums their values.
   */
  private async fetchTargetPositionsValue(): Promise<number> {
    try {
      const dataApiUrl = 'https://data-api.polymarket.com';
      const response = await fetch(`${dataApiUrl}/positions?user=${this.config.targetWallet}`);

      if (!response.ok) {
        console.log('    Failed to fetch target positions from Data API');
        return 0;
      }

      const data = await response.json();

      if (!data || !Array.isArray(data)) {
        return 0;
      }

      let totalValue = 0;
      for (const pos of data) {
        const size = parseFloat(pos.size || pos.shares || '0');
        if (size > 0) {
          const value = parseFloat(pos.currentValue || pos.value || '0');
          totalValue += value;
        }
      }

      return totalValue;
    } catch (error) {
      console.error('Error fetching target positions value:', error);
      return 0;
    }
  }

  private async placeOrder(
    position: Position,
    size: number
  ): Promise<TradeExecutionResult> {
    try {
      // Calculate price with slippage tolerance (max price willing to pay)
      const maxPrice = Math.min(position.price * (1 + this.config.slippageTolerance), 0.99);
      // Calculate token amount using max price to ensure we don't exceed our USD budget
      const tokenAmount = size / maxPrice;

      console.log('Placing order:');
      console.log(`  Token ID: ${position.outcomeId}`);
      console.log(`  Max Price: ${maxPrice.toFixed(4)}`);
      console.log(`  Size: ${tokenAmount.toFixed(2)} tokens ($${size.toFixed(2)} USDC)`);
      console.log(`  Side: BUY`);

      // Create and post order using CLOB client
      const order = await this.client.createAndPostOrder({
        tokenID: position.outcomeId,
        price: parseFloat(maxPrice.toFixed(4)),
        side: 'BUY' as any,
        size: parseFloat(tokenAmount.toFixed(2)),
        feeRateBps: 0,
      });

      const orderId = (order as any)?.orderID || (order as any)?.id || `ORDER-${Date.now()}`;
      const txHash = (order as any)?.transactionsHashes?.[0] ||
                     (order as any)?.transactionHash ||
                     (order as any)?.txHash || '';

      console.log(`Order placed: ${orderId}`);

      return {
        success: true,
        orderId,
        filledAmount: size,
        txHash,
      };
    } catch (error) {
      console.error('Error placing order:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Order placement failed',
      };
    }
  }

  private simulateTrade(
    position: Position,
    size: number
  ): TradeExecutionResult {
    const simulatedOrderId = `SIM-${Date.now()}`;

    // Log simulated trade
    const trade: Trade = {
      marketId: position.marketId,
      outcome: position.outcome,
      targetAmount: position.value,
      ourAmount: size,
      price: position.price,
      timestamp: new Date(),
      txHash: `sim_${simulatedOrderId}`,
    };

    this.db.logTrade(trade);

    console.log(`Simulated Order ID: ${simulatedOrderId}`);
    console.log(`Simulated trade: $${size.toFixed(2)} at $${position.price.toFixed(4)}`);

    return {
      success: true,
      orderId: simulatedOrderId,
      filledAmount: size,
    };
  }

  public async getOrderStatus(orderId: string): Promise<any> {
    try {
      const order = await this.client.getOrder(orderId);
      return order;
    } catch (error) {
      console.error('Error fetching order status:', error);
      return null;
    }
  }
}
