import { AppConfig, RiskValidationResult, UserBalance, OrderBook } from './types.js';
import { DatabaseManager } from './database.js';
import { ethers } from 'ethers';

export class RiskManager {
  private config: AppConfig;
  private db: DatabaseManager;
  private wallet: ethers.Wallet;
  private cachedDecimals: number | null = null;

  // Polygon USDC contract address
  private readonly USDC_ADDRESS = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';

  // USDC ABI (minimal - just balanceOf)
  private readonly USDC_ABI = [
    'function balanceOf(address owner) view returns (uint256)',
    'function decimals() view returns (uint8)',
  ];

  private static readonly MAX_RETRIES = 4;
  private static readonly BASE_DELAY_MS = 2000;

  constructor(config: AppConfig, db: DatabaseManager, wallet: ethers.Wallet) {
    this.config = config;
    this.db = db;
    this.wallet = wallet;
  }

  /**
   * Retry an async operation with exponential backoff (2s, 4s, 8s, 16s).
   */
  private async withRetry<T>(operation: () => Promise<T>, label: string): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= RiskManager.MAX_RETRIES; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        const isRateLimit = error?.info?.error?.message?.includes('rate limit')
          || error?.info?.error?.code === -32090
          || error?.code === 'CALL_EXCEPTION';

        if (!isRateLimit || attempt === RiskManager.MAX_RETRIES) {
          throw error;
        }

        const delay = RiskManager.BASE_DELAY_MS * Math.pow(2, attempt);
        console.log(`  [${label}] Rate limited, retrying in ${delay / 1000}s (attempt ${attempt + 1}/${RiskManager.MAX_RETRIES})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw lastError;
  }

  public async validateTrade(
    tradeAmount: number,
    orderBook?: OrderBook
  ): Promise<RiskValidationResult> {
    const checks = {
      maxTradeSize: false,
      dailyLimit: false,
      liquidity: false,
      balance: false,
    };

    // Check 1: Max trade size
    if (tradeAmount <= this.config.maxTradeSize) {
      checks.maxTradeSize = true;
    } else {
      return {
        approved: false,
        reason: `Trade amount $${tradeAmount.toFixed(2)} exceeds max trade size $${this.config.maxTradeSize}`,
        checks,
      };
    }

    // Check 2: Daily spending limit
    const todaySpending = this.db.getTodaySpending();
    const projectedSpending = todaySpending + tradeAmount;

    if (projectedSpending <= this.config.dailySpendingLimit) {
      checks.dailyLimit = true;
    } else {
      return {
        approved: false,
        reason: `Daily limit exceeded. Current: $${todaySpending.toFixed(2)}, Attempted: $${tradeAmount.toFixed(2)}, Limit: $${this.config.dailySpendingLimit}`,
        checks,
      };
    }

    // Check 3: Liquidity check
    if (orderBook) {
      const hasLiquidity = this.checkLiquidity(orderBook, tradeAmount);
      if (hasLiquidity) {
        checks.liquidity = true;
      } else {
        return {
          approved: false,
          reason: `Insufficient market liquidity for trade size $${tradeAmount.toFixed(2)}`,
          checks,
        };
      }
    } else {
      checks.liquidity = true;
    }

    // Check 4: User balance
    try {
      const balance = await this.getUserBalance();

      if (balance.available >= tradeAmount) {
        checks.balance = true;
      } else {
        return {
          approved: false,
          reason: `Insufficient balance. Available: $${balance.available.toFixed(2)}, Required: $${tradeAmount.toFixed(2)}`,
          checks,
        };
      }
    } catch (error) {
      console.error('Error checking balance:', error);
      return {
        approved: false,
        reason: 'Failed to verify account balance',
        checks,
      };
    }

    // All checks passed
    return {
      approved: true,
      checks,
    };
  }

  private checkLiquidity(orderBook: OrderBook, tradeAmount: number): boolean {
    if (!orderBook || !orderBook.asks || orderBook.asks.length === 0) {
      return false;
    }

    let totalLiquidity = 0;
    for (const ask of orderBook.asks) {
      const size = parseFloat(ask.size);
      const price = parseFloat(ask.price);
      totalLiquidity += size * price;
    }

    const requiredLiquidity = tradeAmount * this.config.minLiquidityRatio;
    return totalLiquidity >= requiredLiquidity;
  }

  private async getUserBalance(): Promise<UserBalance> {
    return this.withRetry(async () => {
      const provider = this.wallet.provider;
      if (!provider) {
        throw new Error('Wallet provider not available');
      }

      const usdcContract = new ethers.Contract(
        this.USDC_ADDRESS,
        this.USDC_ABI,
        provider
      );

      const balance = await usdcContract.balanceOf(this.wallet.address);

      // Cache decimals to avoid redundant RPC calls (USDC is always 6)
      if (this.cachedDecimals === null) {
        this.cachedDecimals = Number(await usdcContract.decimals());
      }

      const balanceInUSDC = parseFloat(ethers.formatUnits(balance, this.cachedDecimals));

      return {
        total: balanceInUSDC,
        available: balanceInUSDC,
        locked: 0,
      };
    }, 'getUserBalance');
  }

  public async getBalance(): Promise<UserBalance> {
    return this.getUserBalance();
  }

  /**
   * Fetch USDC balance for any wallet address on Polygon.
   */
  public async getUsdcBalanceOf(address: string): Promise<number> {
    try {
      return await this.withRetry(async () => {
        const provider = this.wallet.provider;
        if (!provider) {
          throw new Error('Wallet provider not available');
        }

        const usdcContract = new ethers.Contract(
          this.USDC_ADDRESS,
          this.USDC_ABI,
          provider
        );

        const balance = await usdcContract.balanceOf(address);

        if (this.cachedDecimals === null) {
          this.cachedDecimals = Number(await usdcContract.decimals());
        }

        return parseFloat(ethers.formatUnits(balance, this.cachedDecimals));
      }, 'getUsdcBalanceOf');
    } catch (error) {
      console.error(`Error fetching USDC balance for ${address}:`, error);
      return 0;
    }
  }

  public async printRiskStatus(): Promise<void> {
    try {
      const balance = await this.getUserBalance();
      const todaySpending = this.db.getTodaySpending();
      const tradeCount = this.db.getTradeCount();

      console.log('\n=== Risk Status ===');
      console.log(`USDC Balance: $${balance.available.toFixed(2)}`);
      if (this.config.targetBalance > 0) {
        const ratio = balance.available / this.config.targetBalance;
        console.log(`Target Balance: $${this.config.targetBalance.toLocaleString()} (manual)`);
        console.log(`Copy Ratio: 1:${(this.config.targetBalance / balance.available).toFixed(0)} (${(ratio * 100).toFixed(4)}%)`);
      } else {
        console.log(`Target Balance: Auto-fetch (live from chain + positions)`);
      }
      console.log(`Today's Spending: $${todaySpending.toFixed(2)} / $${this.config.dailySpendingLimit}`);
      console.log(`Remaining Today: $${(this.config.dailySpendingLimit - todaySpending).toFixed(2)}`);
      console.log(`Total Trades: ${tradeCount}`);
      console.log(`Max Trade Size: $${this.config.maxTradeSize}`);
      console.log('==================\n');
    } catch (error) {
      console.error('Error printing risk status:', error);
    }
  }
}
