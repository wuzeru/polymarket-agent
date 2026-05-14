import Database from 'better-sqlite3';
import type { Fill } from '../types/strategy.js';
import type { Signal } from '../types/strategy.js';
import type { PnLSnapshot, DailyStats } from '../types/simulation.js';
import { config } from '../config.js';

/**
 * SQLite-backed state store for persisting trades, signals, and statistics.
 */
export class StateStore {
  private db: Database.Database;

  constructor(dbPath = ':memory:') {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        signal_id TEXT NOT NULL,
        token_a TEXT NOT NULL,
        token_b TEXT NOT NULL,
        price_a REAL NOT NULL,
        price_b REAL NOT NULL,
        size REAL NOT NULL,
        fee_a REAL NOT NULL,
        fee_b REAL NOT NULL,
        timestamp INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS signals (
        id TEXT PRIMARY KEY,
        strategy_name TEXT NOT NULL,
        type TEXT NOT NULL,
        token_a TEXT NOT NULL,
        token_b TEXT NOT NULL,
        ask_a REAL NOT NULL,
        ask_b REAL NOT NULL,
        total_cost REAL NOT NULL,
        gross_profit REAL NOT NULL,
        net_profit REAL NOT NULL,
        depth_a REAL NOT NULL,
        depth_b REAL NOT NULL,
        max_size REAL NOT NULL,
        executed INTEGER NOT NULL DEFAULT 0,
        timestamp INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS daily_stats (
        date TEXT PRIMARY KEY,
        trade_count INTEGER NOT NULL DEFAULT 0,
        volume REAL NOT NULL DEFAULT 0,
        gross_profit REAL NOT NULL DEFAULT 0,
        net_profit REAL NOT NULL DEFAULT 0,
        win_rate REAL NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(timestamp);
      CREATE INDEX IF NOT EXISTS idx_signals_timestamp ON signals(timestamp);
      CREATE INDEX IF NOT EXISTS idx_signals_executed ON signals(executed);
    `);
  }

  /** Insert a trading signal */
  saveSignal(signal: Signal): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO signals
        (id, strategy_name, type, token_a, token_b, ask_a, ask_b,
         total_cost, gross_profit, net_profit, depth_a, depth_b, max_size, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      signal.id, signal.strategyName, signal.type,
      signal.tokenA, signal.tokenB, signal.askA, signal.askB,
      signal.totalCost, signal.grossProfit, signal.netProfit,
      signal.depthA, signal.depthB, signal.maxSize,
      signal.timestamp,
    );
  }

  /** Record a fill (trade) */
  saveFill(fill: Fill): void {
    const stmt = this.db.prepare(`
      INSERT INTO trades
        (signal_id, token_a, token_b, price_a, price_b, size, fee_a, fee_b, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      fill.signalId, fill.tokenA, fill.tokenB,
      fill.priceA, fill.priceB, fill.size,
      fill.feeA, fill.feeB, fill.timestamp,
    );

    // Mark signal as executed
    const mark = this.db.prepare('UPDATE signals SET executed = 1 WHERE id = ?');
    mark.run(fill.signalId);
  }

  /** Save daily statistics */
  saveDailyStats(stats: DailyStats): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO daily_stats
        (date, trade_count, volume, gross_profit, net_profit, win_rate)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(stats.date, stats.tradeCount, stats.volume, stats.grossProfit, stats.netProfit, stats.winRate);
  }

  /** Persist a PnL snapshot as daily stats */
  persistSnapshot(snapshot: PnLSnapshot): void {
    const today = new Date().toISOString().slice(0, 10);
    this.saveDailyStats({
      date: today,
      tradeCount: snapshot.totalTrades,
      volume: snapshot.totalVolume,
      grossProfit: snapshot.grossProfit,
      netProfit: snapshot.netProfit,
      winRate: snapshot.winRate,
    });
  }

  /** Get all trades */
  getAllTrades(): Fill[] {
    const rows = this.db.prepare(`
      SELECT signal_id, token_a, token_b, price_a, price_b, size, fee_a, fee_b, timestamp
      FROM trades ORDER BY timestamp DESC
    `).all() as Array<Record<string, unknown>>;

    return rows.map(r => ({
      signalId: r.signal_id as string,
      tokenA: r.token_a as string,
      tokenB: r.token_b as string,
      priceA: r.price_a as number,
      priceB: r.price_b as number,
      size: r.size as number,
      feeA: r.fee_a as number,
      feeB: r.fee_b as number,
      timestamp: r.timestamp as number,
    }));
  }

  /** Get all daily stats rows */
  getAllDailyStats(): DailyStats[] {
    return this.db.prepare(`
      SELECT date, trade_count, volume, gross_profit, net_profit, win_rate
      FROM daily_stats ORDER BY date DESC
    `).all() as DailyStats[];
  }

  /** Replay all trades to compute cumulative PnL and total trade count */
  getCumulativeStats(): { cumulativePnL: number; totalTrades: number } {
    const rows = this.db.prepare(`
      SELECT price_a, price_b, size, fee_a, fee_b FROM trades ORDER BY timestamp ASC
    `).all() as Array<{ price_a: number; price_b: number; size: number; fee_a: number; fee_b: number }>;

    let cumulativePnL = config.initialBalance;
    for (const row of rows) {
      const netPnL = row.size * 1.0 - (row.price_a + row.price_b + row.fee_a + row.fee_b);
      cumulativePnL += netPnL;
    }

    return { cumulativePnL, totalTrades: rows.length };
  }

  /** Close the database connection */
  close(): void {
    this.db.close();
  }
}