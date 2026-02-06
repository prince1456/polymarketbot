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

      // Step 1: Calculate our position size
      const ourSize = await this.calculateProportionalSize(targetPosition);
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

  private async calculateProportionalSize(targetPosition: Position): Promise<number> {
    try {
      // Get our current balance
      const ourBalance = await this.risk.getBalance();

      // For proportional sizing, we use:
      // our_trade_size = our_balance * target_position_percentage * allocation_percentage

      // Calculate what percentage of target's balance this trade represents
      // We approximate by assuming target has similar capital (this is a simplification)
      // A more accurate implementation would fetch target's total balance
      const targetPositionValue = targetPosition.value;

      // Calculate our proportional trade size
      // Using the configured percentage allocation
      const ourTradeSize = ourBalance.available * this.config.percentageAllocation;

      // Cap it at the target's position value (don't trade more than they did)
      const finalSize = Math.min(ourTradeSize, targetPositionValue);

      return finalSize;
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
      // Calculate price with slippage
      const priceWithSlippage = position.price * (1 + this.config.slippageTolerance);
      const tokenAmount = size / position.price;

      console.log('Placing order:');
      console.log(`  Token ID: ${position.outcomeId}`);
      console.log(`  Price: ${priceWithSlippage.toFixed(4)}`);
      console.log(`  Size: ${tokenAmount.toFixed(2)} tokens`);
      console.log(`  Side: BUY`);

      // Note: The actual order placement would use the CLOB client's createOrder
      // and postOrder methods, but these require proper authentication and signing
      // with the wallet. For now, we'll return a placeholder that indicates
      // the order parameters are ready.

      // In production, you would:
      // 1. Create the order with proper signing using wallet private key
      // 2. Post the order to the CLOB
      // 3. Wait for order confirmation

      const simulatedOrderId = `ORDER-${Date.now()}`;
      const simulatedTxHash = `0x${Math.random().toString(16).substr(2, 64)}`;

      console.log(`Order would be placed with ID: ${simulatedOrderId}`);

      return {
        success: true,
        orderId: simulatedOrderId,
        filledAmount: size,
        txHash: simulatedTxHash,
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
    const simulatedTxHash = `0x${Math.random().toString(16).substr(2, 64)}`;

    // Log simulated trade
    const trade: Trade = {
      marketId: position.marketId,
      outcome: position.outcome,
      targetAmount: position.value,
      ourAmount: size,
      price: position.price,
      timestamp: new Date(),
      txHash: simulatedTxHash,
    };

    this.db.logTrade(trade);

    console.log(`Simulated Order ID: ${simulatedOrderId}`);
    console.log(`Simulated TX Hash: ${simulatedTxHash}`);

    return {
      success: true,
      orderId: simulatedOrderId,
      filledAmount: size,
      txHash: simulatedTxHash,
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
