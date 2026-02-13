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
   */
  private async calculateProportionalSize(targetPosition: Position): Promise<number> {
    try {
      const ourBalance = await this.risk.getBalance();
      const targetTradeValue = targetPosition.value;
      const targetTotalBalance = this.config.targetBalance;

      // Calculate what ratio of the target's portfolio this trade represents
      const ratio = targetTradeValue / targetTotalBalance;

      // Apply the same ratio to our balance
      let ourTradeSize = ourBalance.available * ratio;

      console.log(`  Ratio calculation:`);
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
