import type { Level } from '../types/market.js';

interface TokenState {
  /** Remaining depth at each price level (copy of latest WS snapshot) */
  levels: Level[];
  /** Last WS update timestamp */
  lastTick: number;
}

/**
 * Virtual order book — consumes real WS depth to simulate fills.
 * Levels are restored on each WS tick to reflect fresh market data.
 */
export class VirtualBook {
  private tokens = new Map<string, TokenState>();

  /** Refresh a token's depth from a new WS snapshot */
  refresh(tokenId: string, levels: Level[], timestamp: number): void {
    this.tokens.set(tokenId, {
      levels: levels.map(l => ({ ...l })),
      lastTick: timestamp,
    });
  }

  /**
   * Simulate buying `size` units of a token at market ask.
   * Walks ask levels, consuming from cheapest to most expensive.
   * Returns total cost; throws if insufficient depth.
   *
   * NOTE: This intentionally mutates `level.size` to deplete depth across
   * multiple fills within the same scan. Each WS `refresh()` call restores
   * depth from the live order book snapshot, so simulation within a scan
   * correctly reflects the diminishing liquidity of a real trade.
   */
  consume(tokenId: string, size: number): number {
    const state = this.tokens.get(tokenId);
    if (!state || state.levels.length === 0) {
      throw new Error(`No depth available for token ${tokenId}`);
    }

    let remaining = size;
    let totalCost = 0;

    for (const level of state.levels) {
      if (remaining <= 0) break;

      const fillSize = Math.min(remaining, level.size);
      totalCost += fillSize * level.price;
      level.size -= fillSize;
      remaining -= fillSize;
    }

    if (remaining > 0) {
      throw new Error(`Insufficient depth for token ${tokenId}: need ${size}, available ${size - remaining}`);
    }

    return totalCost;
  }

  /** Check if a token has sufficient depth for a given size */
  hasDepth(tokenId: string, size: number): boolean {
    const state = this.tokens.get(tokenId);
    if (!state) return false;

    const available = state.levels.reduce((sum, l) => sum + l.size, 0);
    return available >= size;
  }
}