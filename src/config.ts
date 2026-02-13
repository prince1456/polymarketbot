import dotenv from 'dotenv';
import { AppConfig } from './types.js';

dotenv.config();

function getEnvVar(key: string, required = true): string {
  const value = process.env[key];
  if (required && !value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value || '';
}

function getEnvNumber(key: string, defaultValue?: number): number {
  const value = process.env[key];
  if (!value) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Missing required environment variable: ${key}`);
  }
  const parsed = parseFloat(value);
  if (isNaN(parsed)) {
    throw new Error(`Invalid number for environment variable ${key}: ${value}`);
  }
  return parsed;
}

function getEnvBoolean(key: string, defaultValue = false): boolean {
  const value = process.env[key];
  if (!value) {
    return defaultValue;
  }
  return value.toLowerCase() === 'true';
}

export function loadConfig(): AppConfig {
  const config: AppConfig = {
    // Wallet configuration
    privateKey: getEnvVar('PRIVATE_KEY'),
    targetWallet: getEnvVar('TARGET_WALLET'),

    // Polymarket API
    polymarketApiKey: getEnvVar('POLYMARKET_API_KEY'),
    polymarketApiUrl: getEnvVar('POLYMARKET_API_URL', false) || 'https://clob.polymarket.com',

    // Trading configuration
    targetBalance: getEnvNumber('TARGET_BALANCE', 0),
    maxTradeSize: getEnvNumber('MAX_TRADE_SIZE'),
    dailySpendingLimit: getEnvNumber('DAILY_SPENDING_LIMIT'),
    minLiquidityRatio: getEnvNumber('MIN_LIQUIDITY_RATIO'),
    slippageTolerance: getEnvNumber('SLIPPAGE_TOLERANCE', 0.02),

    // Operational settings
    dryRun: getEnvBoolean('DRY_RUN', true),
    pollInterval: getEnvNumber('POLL_INTERVAL', 60),
    databasePath: getEnvVar('DATABASE_PATH', false) || './polymarket.db',
    logLevel: (getEnvVar('LOG_LEVEL', false) || 'info') as AppConfig['logLevel'],
  };

  // Validate configuration
  validateConfig(config);

  return config;
}

function validateConfig(config: AppConfig): void {
  // Validate private key format (should start with 0x and be 66 chars)
  if (!config.privateKey.startsWith('0x') || config.privateKey.length !== 66) {
    throw new Error('Invalid PRIVATE_KEY format. Must start with 0x and be 64 hex characters.');
  }

  // Validate target wallet address
  if (!config.targetWallet.startsWith('0x') || config.targetWallet.length !== 42) {
    throw new Error('Invalid TARGET_WALLET format. Must be a valid Ethereum address (0x + 40 hex chars).');
  }

  // Validate target balance (0 = auto-fetch, any positive value = manual override)
  if (config.targetBalance < 0) {
    throw new Error('TARGET_BALANCE must be 0 (auto-fetch) or a positive number.');
  }

  // Validate max trade size
  if (config.maxTradeSize <= 0) {
    throw new Error('MAX_TRADE_SIZE must be greater than 0.');
  }

  // Validate daily spending limit
  if (config.dailySpendingLimit <= 0) {
    throw new Error('DAILY_SPENDING_LIMIT must be greater than 0.');
  }

  // Validate liquidity ratio
  if (config.minLiquidityRatio < 0 || config.minLiquidityRatio > 1) {
    throw new Error('MIN_LIQUIDITY_RATIO must be between 0 and 1.');
  }

  // Validate slippage tolerance
  if (config.slippageTolerance < 0 || config.slippageTolerance > 1) {
    throw new Error('SLIPPAGE_TOLERANCE must be between 0 and 1.');
  }

  // Validate log level
  const validLogLevels = ['debug', 'info', 'warn', 'error'];
  if (!validLogLevels.includes(config.logLevel)) {
    throw new Error(`LOG_LEVEL must be one of: ${validLogLevels.join(', ')}`);
  }
}

export function printConfig(config: AppConfig): void {
  console.log('Configuration loaded:');
  console.log('  Wallet:');
  console.log(`    Private Key: ${config.privateKey.substring(0, 10)}...${config.privateKey.substring(60)}`);
  console.log(`    Target Wallet: ${config.targetWallet}`);
  console.log('  Trading:');
  console.log(`    Target Balance: ${config.targetBalance > 0 ? '$' + config.targetBalance.toLocaleString() : 'Auto-fetch'}`);
  console.log(`    Max Trade Size: $${config.maxTradeSize}`);
  console.log(`    Daily Spending Limit: $${config.dailySpendingLimit}`);
  console.log(`    Min Liquidity Ratio: ${(config.minLiquidityRatio * 100).toFixed(1)}%`);
  console.log(`    Slippage Tolerance: ${(config.slippageTolerance * 100).toFixed(1)}%`);
  console.log('  Operational:');
  console.log(`    Dry Run: ${config.dryRun ? 'ENABLED' : 'DISABLED'}`);
  console.log(`    Poll Interval: ${config.pollInterval}s`);
  console.log(`    Database: ${config.databasePath}`);
  console.log(`    Log Level: ${config.logLevel}`);
  console.log('');
}
