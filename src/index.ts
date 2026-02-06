import { ethers } from 'ethers';
import { loadConfig, printConfig } from './config.js';
import { DatabaseManager } from './database.js';
import { PositionMonitor } from './monitor.js';
import { RiskManager } from './risk.js';
import { TradeExecutor } from './executor.js';
import { PositionChange } from './types.js';

class PolymarketCopyTradingBot {
  private config;
  private db!: DatabaseManager;
  private monitor!: PositionMonitor;
  private risk!: RiskManager;
  private executor!: TradeExecutor;
  private wallet!: ethers.Wallet;
  private isShuttingDown = false;

  constructor() {
    this.config = loadConfig();
  }

  public async initialize(): Promise<void> {
    console.log('\n🤖 Polymarket Copy Trading Bot');
    console.log('================================\n');

    printConfig(this.config);

    // Initialize wallet
    console.log('Initializing wallet...');
    const provider = new ethers.JsonRpcProvider('https://polygon-rpc.com');
    this.wallet = new ethers.Wallet(this.config.privateKey, provider);
    console.log(`Wallet address: ${this.wallet.address}\n`);

    // Initialize database
    console.log('Initializing database...');
    this.db = new DatabaseManager(this.config.databasePath);

    // Initialize risk manager
    console.log('Initializing risk manager...');
    this.risk = new RiskManager(this.config, this.db, this.wallet);
    await this.risk.printRiskStatus();

    // Initialize trade executor
    console.log('Initializing trade executor...');
    this.executor = new TradeExecutor(this.config, this.db, this.risk, this.wallet);

    // Initialize position monitor
    console.log('Initializing position monitor...');
    this.monitor = new PositionMonitor(this.config, this.db);

    // Set up event handlers
    this.setupEventHandlers();

    console.log('✓ All services initialized\n');
  }

  private setupEventHandlers(): void {
    this.monitor.on('newPosition', async (change: PositionChange) => {
      if (this.isShuttingDown) {
        return;
      }

      try {
        console.log('\n📊 New position detected from target wallet');
        console.log(`Market: ${change.position.marketId}`);
        console.log(`Outcome: ${change.position.outcome}`);
        console.log(`Target Size: ${change.position.size}`);
        console.log(`Price: $${change.position.price.toFixed(2)}`);
        console.log(`Value: $${change.position.value.toFixed(2)}`);

        if (this.config.dryRun) {
          console.log('\n⚠️  DRY RUN MODE - Trade will be simulated\n');
        }

        // Execute the copy trade
        const result = await this.executor.executePositionCopy(change.position);

        if (result.success) {
          console.log('✅ Position copied successfully!');
          if (result.orderId) {
            console.log(`Order ID: ${result.orderId}`);
          }
          if (result.txHash) {
            console.log(`TX Hash: ${result.txHash}`);
          }
        } else {
          console.log('❌ Failed to copy position');
          if (result.error) {
            console.log(`Error: ${result.error}`);
          }
        }

        // Print updated risk status
        await this.risk.printRiskStatus();
      } catch (error) {
        console.error('Error handling new position:', error);
      }
    });
  }

  public async start(): Promise<void> {
    try {
      console.log('🚀 Starting bot...\n');

      if (this.config.dryRun) {
        console.log('⚠️  ================================');
        console.log('⚠️  DRY RUN MODE IS ENABLED');
        console.log('⚠️  No real trades will be executed');
        console.log('⚠️  ================================\n');
      } else {
        console.log('⚠️  ================================');
        console.log('⚠️  LIVE TRADING MODE');
        console.log('⚠️  Real trades will be executed!');
        console.log('⚠️  ================================\n');
      }

      // Start monitoring
      await this.monitor.start();

      console.log('✓ Bot is now running');
      console.log(`Monitoring wallet: ${this.config.targetWallet}`);
      console.log('Press Ctrl+C to stop\n');

      // Keep the process running
      await this.keepAlive();
    } catch (error) {
      console.error('Error starting bot:', error);
      throw error;
    }
  }

  private async keepAlive(): Promise<void> {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (this.isShuttingDown) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 1000);
    });
  }

  public async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;

    console.log('\n\n🛑 Shutting down gracefully...');

    // Stop monitor
    if (this.monitor) {
      this.monitor.stop();
      console.log('✓ Position monitor stopped');
    }

    // Close database
    if (this.db) {
      this.db.close();
      console.log('✓ Database closed');
    }

    // Print final stats
    console.log('\nFinal Statistics:');
    const tradeCount = this.db.getTradeCount();
    const totalSpent = this.db.getTotalSpent(30);
    console.log(`  Total Trades: ${tradeCount}`);
    console.log(`  Total Spent (30 days): $${totalSpent.toFixed(2)}`);

    console.log('\n👋 Goodbye!\n');
  }
}

async function main() {
  const bot = new PolymarketCopyTradingBot();

  // Handle graceful shutdown
  const shutdownHandler = async () => {
    await bot.shutdown();
    process.exit(0);
  };

  process.on('SIGINT', shutdownHandler);
  process.on('SIGTERM', shutdownHandler);

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    bot.shutdown().then(() => process.exit(1));
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled rejection at:', promise, 'reason:', reason);
    bot.shutdown().then(() => process.exit(1));
  });

  try {
    await bot.initialize();
    await bot.start();
  } catch (error) {
    console.error('Fatal error:', error);
    await bot.shutdown();
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { PolymarketCopyTradingBot };
