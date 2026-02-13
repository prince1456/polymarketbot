import { EventEmitter } from 'events';
import { ClobClient } from '@polymarket/clob-client';
import { AppConfig, Position, PositionChange } from './types.js';
import { DatabaseManager } from './database.js';

export class PositionMonitor extends EventEmitter {
  private config: AppConfig;
  private client: ClobClient;
  private db: DatabaseManager;
  private previousPositions: Map<string, Position> = new Map();
  private monitorInterval?: NodeJS.Timeout;
  private isRunning = false;
  private initialSnapshotLoaded = false;

  constructor(config: AppConfig, db: DatabaseManager) {
    super();
    this.config = config;
    this.db = db;

    // Initialize CLOB client
    // Note: For read-only operations (monitoring), we don't need wallet authentication
    const host = config.polymarketApiUrl || 'https://clob.polymarket.com';
    this.client = new ClobClient(host, 137);

    console.log('Position Monitor initialized');
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      console.log('Monitor already running');
      return;
    }

    this.isRunning = true;
    this.initialSnapshotLoaded = false;
    console.log(`Starting position monitor for wallet: ${this.config.targetWallet}`);

    // Snapshot existing positions (don't trigger trades for these)
    await this.loadInitialSnapshot();

    // Start monitoring loop
    this.monitorInterval = setInterval(async () => {
      try {
        await this.checkPositions();
      } catch (error) {
        console.error('Error in monitoring loop:', error);
      }
    }, this.config.pollInterval * 1000);

    console.log(`Monitor running, polling every ${this.config.pollInterval} seconds`);
  }

  public stop(): void {
    if (!this.isRunning) {
      return;
    }

    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = undefined;
    }

    this.isRunning = false;
    console.log('Position monitor stopped');
  }

  private async loadInitialSnapshot(): Promise<void> {
    try {
      const positions = await this.fetchTargetPositions();

      console.log(`Snapshotting ${positions.length} existing positions (will not copy these)`);

      // Store all existing positions so we don't treat them as new
      this.updatePositionsCache(positions);
      this.initialSnapshotLoaded = true;

      for (const pos of positions) {
        console.log(`  [snapshot] ${pos.outcome} on ${pos.marketId} — size: ${pos.size}, value: $${pos.value.toFixed(2)}`);
      }
    } catch (error) {
      console.error('Error loading initial snapshot:', error);
      // Mark as loaded anyway so the bot can start detecting new positions
      this.initialSnapshotLoaded = true;
    }
  }

  private async checkPositions(): Promise<void> {
    try {
      const positions = await this.fetchTargetPositions();

      if (positions.length === 0) {
        console.log('No positions found for target wallet');
        return;
      }

      console.log(`Target wallet has ${positions.length} positions`);

      for (const position of positions) {
        await this.processPosition(position);
      }

      // Update previous positions map
      this.updatePositionsCache(positions);
    } catch (error) {
      console.error('Error checking positions:', error);
      throw error;
    }
  }

  private async fetchTargetPositions(): Promise<Position[]> {
    try {
      // Note: The CLOB API doesn't have a direct method to fetch another user's orders
      // We'll need to use the Data API endpoint directly via fetch
      const dataApiUrl = 'https://data-api.polymarket.com';
      const response = await fetch(`${dataApiUrl}/positions?user=${this.config.targetWallet}`);

      if (!response.ok) {
        console.log('Failed to fetch positions from Data API');
        return [];
      }

      const data = await response.json();

      if (!data || !Array.isArray(data)) {
        return [];
      }

      // Convert API response to positions
      const positions: Position[] = data.map((pos: any) => ({
        marketId: pos.market_id || pos.marketId || '',
        conditionId: pos.condition_id || pos.conditionId || '',
        outcomeId: pos.outcome_id || pos.outcomeId || pos.token_id || '',
        outcome: pos.outcome || this.getOutcomeName(pos.outcome_id || pos.token_id),
        size: parseFloat(pos.size || pos.shares || '0'),
        value: parseFloat(pos.value || '0'),
        price: parseFloat(pos.price || '0'),
        timestamp: Date.now(),
      }));

      return positions.filter(p => p.size > 0);
    } catch (error) {
      console.error('Error fetching target positions:', error);
      return [];
    }
  }

  private getOutcomeName(outcomeId: string): string {
    // In Polymarket, outcome tokens are typically:
    // - ending in "0" for NO
    // - ending in "1" for YES
    if (outcomeId.endsWith('1')) {
      return 'YES';
    } else if (outcomeId.endsWith('0')) {
      return 'NO';
    }
    return outcomeId;
  }

  private async processPosition(position: Position): Promise<void> {
    const positionKey = this.getPositionKey(position);
    const previousPosition = this.previousPositions.get(positionKey);

    // Check if this is a new position or an increased position
    const isNew = !previousPosition;
    const isIncreased = previousPosition && position.size > previousPosition.size;

    if (!isNew && !isIncreased) {
      return;
    }

    // Check if we've already copied this trade recently
    if (this.db.checkDuplicate(position.marketId, position.outcome, 5)) {
      console.log(`Skipping duplicate trade: ${position.marketId} - ${position.outcome}`);
      return;
    }

    const change: PositionChange = {
      position,
      isNew,
      previous: previousPosition,
    };

    console.log(`New position detected: ${position.outcome} on market ${position.marketId}`);
    console.log(`  Size: ${position.size} @ $${position.price.toFixed(2)}`);
    console.log(`  Value: $${position.value.toFixed(2)}`);

    // Emit event for the new/increased position
    this.emit('newPosition', change);
  }

  private getPositionKey(position: Position): string {
    return `${position.marketId}-${position.outcomeId}`;
  }

  private updatePositionsCache(positions: Position[]): void {
    this.previousPositions.clear();
    for (const position of positions) {
      const key = this.getPositionKey(position);
      this.previousPositions.set(key, position);
    }
  }

  public async fetchMarketInfo(marketId: string): Promise<any> {
    try {
      // Fetch market details from CLOB
      const book = await this.client.getOrderBook(marketId);
      return book;
    } catch (error) {
      console.error(`Error fetching market info for ${marketId}:`, error);
      return null;
    }
  }

  public async getOrderBook(tokenId: string): Promise<any> {
    try {
      const book = await this.client.getOrderBook(tokenId);
      return book;
    } catch (error) {
      console.error(`Error fetching orderbook for ${tokenId}:`, error);
      return null;
    }
  }

  public getPositionsCount(): number {
    return this.previousPositions.size;
  }

  public getCurrentPositions(): Position[] {
    return Array.from(this.previousPositions.values());
  }
}
