import type { Fill } from '../types/strategy.js';
import type { PnLSnapshot } from '../types/simulation.js';
import { config } from '../config.js';

/**
 * PnL tracker — real-time profit/loss statistics.
 */
export class PnLTracker {
  private trades: { fill: Fill; netPnL: number }[] = [];
  private cumulativePnL = config.initialBalance;
  private peakPnL = config.initialBalance;
  private maxDrawdown = 0;

  /** Record a completed fill and update statistics */
  record(fill: Fill): void {
    // Net PnL for this trade: gross input - total cost - fees
    // Each YES/NO pair resolves to 1.0 at settlement
    const grossInput = fill.size * 1.0;
    const totalCost = fill.priceA + fill.priceB + fill.feeA + fill.feeB;
    const netPnL = grossInput - totalCost;

    this.trades.push({ fill, netPnL });
    this.cumulativePnL += netPnL;

    if (this.cumulativePnL > this.peakPnL) {
      this.peakPnL = this.cumulativePnL;
    }

    const drawdown = this.peakPnL - this.cumulativePnL;
    if (drawdown > this.maxDrawdown) {
      this.maxDrawdown = drawdown;
    }
  }

  /** Get current PnL snapshot */
  snapshot(): PnLSnapshot {
    const totalTrades = this.trades.length;
    const totalVolume = this.trades.reduce((sum, t) => sum + t.fill.size, 0);
    const grossProfit = this.trades.reduce((sum, t) => {
      return sum + (t.fill.size - t.fill.priceA - t.fill.priceB);
    }, 0);
    const netProfit = this.trades.reduce((sum, t) => sum + t.netPnL, 0);
    const wins = this.trades.filter(t => t.netPnL > 0).length;
    const winRate = totalTrades > 0 ? wins / totalTrades : 0;

    // Simple Sharpe approximation (using 0 risk-free rate)
    const returns = this.trades.map(t => t.netPnL / t.fill.size);
    const meanReturn = returns.length > 0
      ? returns.reduce((a, b) => a + b, 0) / returns.length
      : 0;
    const variance = returns.length > 1
      ? returns.reduce((sum, r) => sum + (r - meanReturn) ** 2, 0) / (returns.length - 1)
      : 0;
    const sharpeRatio = variance > 0 ? meanReturn / Math.sqrt(variance) : null;

    return {
      timestamp: Date.now(),
      cumulativePnL: this.cumulativePnL,
      totalTrades,
      totalVolume,
      grossProfit,
      netProfit,
      winRate,
      maxDrawdown: this.maxDrawdown,
      sharpeRatio,
    };
  }

  /** Get recent trades (last N) */
  getRecentTrades(n = 50): { fill: Fill; netPnL: number }[] {
    return this.trades.slice(-n).reverse();
  }

  /** Load persisted PnL state so tracking resumes across skill invocations */
  loadState(cumulativePnL: number): void {
    this.cumulativePnL = cumulativePnL;
    this.peakPnL = cumulativePnL;
  }

  /** Total number of trades executed */
  get totalTrades(): number {
    return this.trades.length;
  }
}