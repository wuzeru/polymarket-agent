import type { Signal, Fill } from '../types/strategy.js';
import type { VirtualBook } from './virtual-book.js';
import type { PnLTracker } from './pnl-tracker.js';
import { config } from '../config.js';

/**
 * Order simulator — virtual execution against live WS depth.
 *
 * Flow: receive Signal → size cap → virtual buy tokenA & tokenB → record Fill
 */
export class OrderSim {
  private virtualBook: VirtualBook;
  private pnlTracker: PnLTracker | null = null;

  constructor(virtualBook: VirtualBook) {
    this.virtualBook = virtualBook;
  }

  /** Attach a PnL tracker for post-trade recording */
  attachPnL(pnlTracker: PnLTracker): void {
    this.pnlTracker = pnlTracker;
  }

  /**
   * Simulate executing a trading signal.
   * Buys both tokens at market ask, records the fill.
   */
  simulate(signal: Signal): Fill {
    const size = Math.min(signal.maxSize, config.maxPositionSize);

    if (!this.virtualBook.hasDepth(signal.tokenA, size)) {
      throw new Error(`VirtualBook: insufficient depth for ${signal.tokenA}`);
    }
    if (!this.virtualBook.hasDepth(signal.tokenB, size)) {
      throw new Error(`VirtualBook: insufficient depth for ${signal.tokenB}`);
    }

    const costA = this.virtualBook.consume(signal.tokenA, size);
    const costB = this.virtualBook.consume(signal.tokenB, size);

    const feeA = signal.askA * 0.002;  // 0.2% taker fee estimate
    const feeB = signal.askB * 0.002;

    const fill: Fill = {
      signalId: signal.id,
      tokenA: signal.tokenA,
      tokenB: signal.tokenB,
      priceA: costA,
      priceB: costB,
      size,
      feeA,
      feeB,
      timestamp: Date.now(),
    };

    this.pnlTracker?.record(fill);

    return fill;
  }
}