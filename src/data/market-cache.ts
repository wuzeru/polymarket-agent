import type { Level, OrderBook } from '../types/market.js';
import { config } from '../config.js';

interface TokenSnapshot {
  bids: Level[];
  asks: Level[];
  timestamp: number;
}

/**
 * In-memory market cache holding real-time order book snapshots.
 * Updated by CLOB WS pushes, consumed by strategy engine.
 */
export class MarketCache {
  private tokenMap = new Map<string, TokenSnapshot>();

  /** Update a token's order book from a WS message */
  update(orderBook: OrderBook): void {
    this.tokenMap.set(orderBook.tokenId, {
      bids: orderBook.bids,
      asks: orderBook.asks,
      timestamp: orderBook.timestamp,
    });
  }

  /** Get the best bid price for a token. Returns null if no data or stale. */
  getBestBid(tokenId: string): number | null {
    const snap = this.tokenMap.get(tokenId);
    if (!snap || this.isStale(snap)) return null;
    return snap.bids[0]?.price ?? null;
  }

  /** Get the best ask price for a token. Returns null if no data or stale. */
  getBestAsk(tokenId: string): number | null {
    const snap = this.tokenMap.get(tokenId);
    if (!snap || this.isStale(snap)) return null;
    return snap.asks[0]?.price ?? null;
  }

  /** Get full order book for a token. Returns null if no data or stale. */
  getOrderBook(tokenId: string): { bids: Level[]; asks: Level[] } | null {
    const snap = this.tokenMap.get(tokenId);
    if (!snap || this.isStale(snap)) return null;
    return { bids: snap.bids, asks: snap.asks };
  }

  /** Get best bid and ask prices for a token pair */
  getPairPrices(
    yesTokenId: string,
    noTokenId: string
  ): { yes: { bid: number | null; ask: number | null }; no: { bid: number | null; ask: number | null } } {
    return {
      yes: {
        bid: this.getBestBid(yesTokenId),
        ask: this.getBestAsk(yesTokenId),
      },
      no: {
        bid: this.getBestBid(noTokenId),
        ask: this.getBestAsk(noTokenId),
      },
    };
  }

  /** Calculate available depth at a given price level (sum of sizes up to the price) */
  getAvailableDepth(tokenId: string, side: 'bid' | 'ask'): number {
    const snap = this.tokenMap.get(tokenId);
    if (!snap || this.isStale(snap)) return 0;

    const levels = side === 'ask' ? snap.asks : snap.bids;
    return levels.reduce((sum, l) => sum + l.size, 0);
  }

  /** Check if a token has fresh data */
  hasToken(tokenId: string): boolean {
    const snap = this.tokenMap.get(tokenId);
    if (!snap) return false;
    return !this.isStale(snap);
  }

  /** Check if a snapshot is beyond the stale threshold */
  private isStale(snap: TokenSnapshot): boolean {
    return Date.now() - snap.timestamp > config.cacheStaleThresholdMs;
  }

  /** Get all token IDs currently in cache (fresh only) */
  getTokenIds(): string[] {
    const now = Date.now();
    const ids: string[] = [];
    for (const [id, snap] of this.tokenMap) {
      if (now - snap.timestamp <= config.cacheStaleThresholdMs) {
        ids.push(id);
      }
    }
    return ids;
  }

  /** Clear all cached data */
  clear(): void {
    this.tokenMap.clear();
  }
}