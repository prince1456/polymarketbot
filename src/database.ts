import Database from 'better-sqlite3';
import { Trade, DailySpending } from './types.js';

export class DatabaseManager {
  private db: Database.Database;

  constructor(databasePath: string) {
    this.db = new Database(databasePath);
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS copied_trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        market_id TEXT NOT NULL,
        outcome TEXT NOT NULL,
        target_amount REAL NOT NULL,
        our_amount REAL NOT NULL,
        price REAL NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        tx_hash TEXT,
        UNIQUE(market_id, outcome, timestamp)
      );

      CREATE TABLE IF NOT EXISTS daily_spending (
        date DATE PRIMARY KEY,
        total_spent REAL NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_copied_trades_market
        ON copied_trades(market_id);

      CREATE INDEX IF NOT EXISTS idx_copied_trades_timestamp
        ON copied_trades(timestamp);

      CREATE INDEX IF NOT EXISTS idx_daily_spending_date
        ON daily_spending(date);
    `);

    console.log('Database initialized successfully');
  }

  public logTrade(trade: Trade): number {
    const stmt = this.db.prepare(`
      INSERT INTO copied_trades (market_id, outcome, target_amount, our_amount, price, tx_hash)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      trade.marketId,
      trade.outcome,
      trade.targetAmount,
      trade.ourAmount,
      trade.price,
      trade.txHash || null
    );

    // Update daily spending
    this.updateDailySpending(trade.ourAmount);

    return info.lastInsertRowid as number;
  }

  public getTodaySpending(): number {
    const today = new Date().toISOString().split('T')[0];
    const stmt = this.db.prepare(`
      SELECT total_spent FROM daily_spending WHERE date = ?
    `);

    const row = stmt.get(today) as DailySpending | undefined;
    return row?.totalSpent || 0;
  }

  private updateDailySpending(amount: number): void {
    const today = new Date().toISOString().split('T')[0];

    const stmt = this.db.prepare(`
      INSERT INTO daily_spending (date, total_spent)
      VALUES (?, ?)
      ON CONFLICT(date)
      DO UPDATE SET total_spent = total_spent + ?
    `);

    stmt.run(today, amount, amount);
  }

  public checkDuplicate(marketId: string, outcome: string, withinMinutes = 5): boolean {
    const cutoffTime = new Date(Date.now() - withinMinutes * 60 * 1000).toISOString();

    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM copied_trades
      WHERE market_id = ?
        AND outcome = ?
        AND timestamp > ?
    `);

    const result = stmt.get(marketId, outcome, cutoffTime) as { count: number };
    return result.count > 0;
  }

  public getRecentTrades(limit = 10): Trade[] {
    const stmt = this.db.prepare(`
      SELECT
        id,
        market_id as marketId,
        outcome,
        target_amount as targetAmount,
        our_amount as ourAmount,
        price,
        timestamp,
        tx_hash as txHash
      FROM copied_trades
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(limit) as Trade[];
  }

  public getTotalSpent(days = 30): number {
    const stmt = this.db.prepare(`
      SELECT SUM(our_amount) as total
      FROM copied_trades
      WHERE timestamp > datetime('now', '-' || ? || ' days')
    `);

    const result = stmt.get(days) as { total: number | null };
    return result.total || 0;
  }

  public getTradeCount(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM copied_trades');
    const result = stmt.get() as { count: number };
    return result.count;
  }

  public getDailySpendingHistory(days = 7): DailySpending[] {
    const stmt = this.db.prepare(`
      SELECT date, total_spent as totalSpent
      FROM daily_spending
      WHERE date >= date('now', '-' || ? || ' days')
      ORDER BY date DESC
    `);

    return stmt.all(days) as DailySpending[];
  }

  public close(): void {
    this.db.close();
  }

  public resetDailySpending(): void {
    const today = new Date().toISOString().split('T')[0];
    const stmt = this.db.prepare(`
      DELETE FROM daily_spending WHERE date < ?
    `);
    stmt.run(today);
  }
}
