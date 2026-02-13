export interface AppConfig {
  // Wallet configuration
  privateKey: string;
  targetWallet: string;

  // Polymarket API
  polymarketApiKey: string;
  polymarketApiUrl?: string;

  // Trading configuration
  targetBalance: number; // 0 = auto-fetch from chain + positions
  maxTradeSize: number;
  dailySpendingLimit: number;
  minLiquidityRatio: number;
  slippageTolerance: number;

  // Operational settings
  dryRun: boolean;
  pollInterval: number;
  databasePath: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export interface Position {
  marketId: string;
  conditionId: string;
  outcomeId: string;
  outcome: string;
  size: number;
  value: number;
  price: number;
  timestamp: number;
}

export interface Market {
  id: string;
  conditionId: string;
  question: string;
  outcomes: string[];
  active: boolean;
  closed: boolean;
}

export interface Trade {
  id?: number;
  marketId: string;
  outcome: string;
  targetAmount: number;
  ourAmount: number;
  price: number;
  timestamp: Date;
  txHash?: string;
}

export interface OrderBookEntry {
  price: string;
  size: string;
}

export interface OrderBook {
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
  timestamp: number;
}

export interface RiskValidationResult {
  approved: boolean;
  reason?: string;
  checks: {
    maxTradeSize: boolean;
    dailyLimit: boolean;
    liquidity: boolean;
    balance: boolean;
  };
}

export interface TradeExecutionResult {
  success: boolean;
  orderId?: string;
  txHash?: string;
  filledAmount?: number;
  error?: string;
}

export interface DailySpending {
  date: string;
  totalSpent: number;
}

export interface PositionChange {
  position: Position;
  isNew: boolean;
  previous?: Position;
}

export interface UserBalance {
  total: number;
  available: number;
  locked: number;
}

export interface MarketPrice {
  outcome: string;
  bid: number;
  ask: number;
  mid: number;
}
