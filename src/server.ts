import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { ethers } from 'ethers';
import { AppConfig, PositionChange } from './types.js';
import { DatabaseManager } from './database.js';
import { PositionMonitor } from './monitor.js';
import { RiskManager } from './risk.js';
import { TradeExecutor } from './executor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class BotServer {
  private app: express.Application;
  private server: http.Server;
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();

  // Bot components
  private db?: DatabaseManager;
  private monitor?: PositionMonitor;
  private risk?: RiskManager;
  private executor?: TradeExecutor;
  private wallet?: ethers.Wallet;
  private config?: AppConfig;
  private isRunning = false;

  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  private setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, '../web')));
  }

  private setupRoutes() {
    // Start bot
    this.app.post('/api/bot/start', async (req, res) => {
      try {
        const config = req.body;

        // Validate config
        if (!config.targetWallet || !config.privateKey) {
          return res.json({ success: false, error: 'Missing required configuration' });
        }

        // Build AppConfig
        this.config = {
          privateKey: config.privateKey,
          targetWallet: config.targetWallet,
          polymarketApiKey: '',
          percentageAllocation: config.percentageAllocation || 0.05,
          maxTradeSize: config.maxTradeSize || 100,
          dailySpendingLimit: config.dailySpendingLimit || 500,
          minLiquidityRatio: config.minLiquidityRatio || 0.1,
          slippageTolerance: 0.02,
          dryRun: config.dryRun !== false,
          pollInterval: 60,
          databasePath: './polymarket.db',
          logLevel: 'info',
        };

        await this.startBot();

        res.json({ success: true });
      } catch (error) {
        console.error('Failed to start bot:', error);
        res.json({ success: false, error: (error as Error).message });
      }
    });

    // Stop bot
    this.app.post('/api/bot/stop', async (req, res) => {
      try {
        await this.stopBot();
        res.json({ success: true });
      } catch (error) {
        res.json({ success: false, error: (error as Error).message });
      }
    });

    // Get bot status
    this.app.get('/api/bot/status', (req, res) => {
      res.json({
        running: this.isRunning,
        config: this.config ? {
          targetWallet: this.config.targetWallet,
          dryRun: this.config.dryRun,
          maxTradeSize: this.config.maxTradeSize,
          dailySpendingLimit: this.config.dailySpendingLimit,
        } : null,
      });
    });

    // Get stats
    this.app.get('/api/stats', async (req, res) => {
      try {
        if (!this.db) {
          return res.json({
            totalTrades: 0,
            todaySpending: 0,
            totalSpent: 0,
            balance: 0,
          });
        }

        const totalTrades = this.db.getTradeCount();
        const todaySpending = this.db.getTodaySpending();
        const totalSpent = this.db.getTotalSpent(30);

        let balance = 0;
        if (this.risk) {
          try {
            const balanceData = await this.risk.getBalance();
            balance = balanceData.available;
          } catch (error) {
            console.error('Failed to get balance:', error);
          }
        }

        res.json({
          totalTrades,
          todaySpending,
          totalSpent,
          balance,
        });
      } catch (error) {
        console.error('Failed to get stats:', error);
        res.json({
          totalTrades: 0,
          todaySpending: 0,
          totalSpent: 0,
          balance: 0,
        });
      }
    });

    // Get positions
    this.app.get('/api/positions', (req, res) => {
      try {
        if (!this.monitor) {
          return res.json([]);
        }

        const positions = this.monitor.getCurrentPositions();
        res.json(positions);
      } catch (error) {
        console.error('Failed to get positions:', error);
        res.json([]);
      }
    });

    // Get trades
    this.app.get('/api/trades', (req, res) => {
      try {
        if (!this.db) {
          return res.json([]);
        }

        const trades = this.db.getRecentTrades(20);
        res.json(trades);
      } catch (error) {
        console.error('Failed to get trades:', error);
        res.json([]);
      }
    });

    // Get target wallet positions
    this.app.get('/api/target/positions', async (req, res) => {
      try {
        const targetWallet = req.query.wallet as string;

        if (!targetWallet) {
          return res.json({ error: 'Wallet address required' });
        }

        // Fetch positions from Polymarket Data API
        const positions = await this.fetchTargetWalletPositions(targetWallet);
        res.json(positions);
      } catch (error) {
        console.error('Failed to fetch target positions:', error);
        res.json({ error: 'Failed to fetch positions' });
      }
    });

    // Serve dashboard for root path
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, '../web/index.html'));
    });
  }

  private setupWebSocket() {
    this.wss.on('connection', (ws) => {
      console.log('Client connected');
      this.clients.add(ws);

      // Send current status
      ws.send(JSON.stringify({
        type: 'status',
        status: this.isRunning ? 'running' : 'stopped',
      }));

      ws.on('close', () => {
        console.log('Client disconnected');
        this.clients.delete(ws);
      });
    });
  }

  private broadcast(data: any) {
    const message = JSON.stringify(data);
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  private async startBot() {
    if (this.isRunning) {
      throw new Error('Bot is already running');
    }

    if (!this.config) {
      throw new Error('Configuration not set');
    }

    console.log('Starting bot...');

    // Initialize wallet
    const provider = new ethers.JsonRpcProvider('https://polygon-rpc.com');
    this.wallet = new ethers.Wallet(this.config.privateKey, provider);
    console.log(`Wallet: ${this.wallet.address}`);

    // Initialize database
    this.db = new DatabaseManager(this.config.databasePath);

    // Initialize risk manager
    this.risk = new RiskManager(this.config, this.db, this.wallet);

    // Initialize trade executor
    this.executor = new TradeExecutor(this.config, this.db, this.risk, this.wallet);

    // Initialize position monitor
    this.monitor = new PositionMonitor(this.config, this.db);

    // Set up event handlers
    this.monitor.on('newPosition', async (change: PositionChange) => {
      this.broadcast({
        type: 'newPosition',
        position: change.position,
      });

      this.broadcast({
        type: 'log',
        message: `New position detected: ${change.position.outcome} on ${change.position.marketId}`,
        level: 'info',
      });

      if (this.executor) {
        const result = await this.executor.executePositionCopy(change.position);

        if (result.success) {
          this.broadcast({
            type: 'tradeExecuted',
            trade: {
              marketId: change.position.marketId,
              outcome: change.position.outcome,
              ourAmount: result.filledAmount || 0,
              targetAmount: change.position.value,
              price: change.position.price,
              timestamp: new Date(),
            },
          });
        } else {
          this.broadcast({
            type: 'tradeRejected',
            reason: result.error || 'Unknown error',
          });
        }
      }
    });

    // Start monitoring
    await this.monitor.start();

    this.isRunning = true;

    this.broadcast({
      type: 'status',
      status: 'running',
    });

    this.broadcast({
      type: 'log',
      message: 'Bot started successfully',
      level: 'success',
    });

    console.log('Bot started successfully');
  }

  private async stopBot() {
    if (!this.isRunning) {
      return;
    }

    console.log('Stopping bot...');

    if (this.monitor) {
      this.monitor.stop();
    }

    if (this.db) {
      this.db.close();
    }

    this.isRunning = false;

    this.broadcast({
      type: 'status',
      status: 'stopped',
    });

    this.broadcast({
      type: 'log',
      message: 'Bot stopped',
      level: 'info',
    });

    console.log('Bot stopped');
  }

  private async fetchTargetWalletPositions(walletAddress: string) {
    try {
      // Use Polymarket Data API to fetch positions
      const dataApiUrl = 'https://data-api.polymarket.com';
      const response = await fetch(`${dataApiUrl}/positions?user=${walletAddress}`);

      if (!response.ok) {
        console.log('Failed to fetch positions from Data API');
        return [];
      }

      const data = await response.json();

      if (!data || !Array.isArray(data)) {
        return [];
      }

      // Transform to our Position format
      const positions = data.map((pos: any) => ({
        marketId: pos.conditionId || pos.market_id || '',
        conditionId: pos.conditionId || '',
        outcomeId: pos.asset || pos.token_id || '',
        outcome: pos.outcome || 'Unknown',
        size: parseFloat(pos.size || '0'),
        value: parseFloat(pos.currentValue || pos.value || '0'),
        price: parseFloat(pos.curPrice || pos.avgPrice || pos.price || '0'),
        avgPrice: parseFloat(pos.avgPrice || '0'),
        timestamp: Date.now(),
        market: pos.title || pos.market || 'Unknown Market',
        pnl: parseFloat(pos.cashPnl || '0'),
        percentPnl: parseFloat(pos.percentPnl || '0'),
      }));

      // Filter to show only positions with size > 0
      return positions.filter((p: any) => p.size > 0);
    } catch (error) {
      console.error('Error fetching target positions:', error);
      return [];
    }
  }

  private getOutcomeName(outcomeId: string): string {
    if (!outcomeId) return 'Unknown';
    if (outcomeId.endsWith('1')) return 'YES';
    if (outcomeId.endsWith('0')) return 'NO';
    return outcomeId;
  }

  public listen(port: number) {
    this.server.listen(port, () => {
      console.log(`\n🚀 Bot Server Running`);
      console.log(`   Dashboard: http://localhost:${port}`);
      console.log(`   API: http://localhost:${port}/api`);
      console.log(`   WebSocket: ws://localhost:${port}\n`);
    });
  }
}

// Start server
const server = new BotServer();
server.listen(3000);

export { BotServer };
