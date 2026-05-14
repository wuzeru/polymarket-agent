import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { HttpsProxyAgent } from 'https-proxy-agent';
import type { OrderBook } from '../types/market.js';
import { config } from '../config.js';

/** Full order book snapshot sent as array on initial subscription */
interface CLOBBookSnapshot {
  asset_id: string;
  market: string;
  timestamp: string;
  bids: Array<{ price: string; size: string }>;
  asks: Array<{ price: string; size: string }>;
}

/** Incremental price change pushed after each trade */
interface CLOBPriceChange {
  asset_id: string;
  price: string;
  size: string;
  side: 'BUY' | 'SELL';
  best_bid: string;
  best_ask: string;
}

interface CLOBPriceChangeMessage {
  market: string;
  price_changes: CLOBPriceChange[];
}

/**
 * CLOB WebSocket client for real-time order book data.
 * Events: 'orderbook', 'error', 'connected', 'disconnected'
 */
export class CLOBWebSocket extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectDelay: number;
  private subscribedTokens = new Set<string>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;

  constructor(url?: string, reconnectDelay?: number) {
    super();
    this.url = url ?? config.clobWsUrl;
    this.reconnectDelay = reconnectDelay ?? config.wsReconnectDelay;
  }

  /** Connect to CLOB WebSocket */
  connect(tokenIds: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws) {
        this.dispose();
      }

      this.disposed = false;

      try {
        const proxyUrl = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY;
        const agent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;
        this.ws = new WebSocket(this.url, {
          headers: { 'User-Agent': 'polymarket-agent/0.1.0' },
          agent,
        });
      } catch (err) {
        reject(err);
        return;
      }

      this.ws.on('open', () => {
        this.emit('connected');
        this.startHeartbeat();
        this.subscribeAll(tokenIds);
        resolve();
      });

      this.ws.on('message', (raw: Buffer) => {
        this.handleRawMessage(raw.toString());
      });

      this.ws.on('error', (err: Error) => {
        this.emit('error', err);
        this.scheduleReconnect(tokenIds);
      });

      this.ws.on('close', () => {
        this.stopHeartbeat();
        this.emit('disconnected');
        if (!this.disposed) {
          this.scheduleReconnect(tokenIds);
        }
      });
    });
  }

  /** Subscribe to all token IDs at once using the Polymarket CLOB subscription format */
  private subscribeAll(tokenIds: string[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const newIds = tokenIds.filter(id => !this.subscribedTokens.has(id));
    if (newIds.length === 0) return;

    this.ws.send(JSON.stringify({ auth: {}, assets_ids: newIds, type: 'Market' }));
    for (const id of newIds) this.subscribedTokens.add(id);
  }

  /** Handle incoming raw messages — two formats from Polymarket CLOB */
  private handleRawMessage(raw: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    // Initial full-book snapshot arrives as an array
    if (Array.isArray(parsed)) {
      for (const snap of parsed as CLOBBookSnapshot[]) {
        if (!snap.asset_id || !snap.bids || !snap.asks) continue;
        this.emit('orderbook', this.buildOrderBook(snap.asset_id, snap.bids, snap.asks));
      }
      return;
    }

    // Incremental updates arrive as {market, price_changes:[...]}
    const msg = parsed as CLOBPriceChangeMessage;
    if (!msg.price_changes) return;

    for (const change of msg.price_changes) {
      if (!change.asset_id || !change.best_ask || !change.best_bid) continue;
      const askPrice = parseFloat(change.best_ask);
      const bidPrice = parseFloat(change.best_bid);
      if (isNaN(askPrice) || isNaN(bidPrice)) continue;

      // Emit a synthetic single-level book so MarketCache stays fresh.
      // Size is unknown from price_change alone; use a placeholder so depth > 0.
      const tradeSize = parseFloat(change.size) || 1;
      const orderBook: OrderBook = {
        tokenId: change.asset_id,
        bids: [{ price: bidPrice, size: tradeSize }],
        asks: [{ price: askPrice, size: tradeSize }],
        timestamp: Date.now(),
      };
      this.emit('orderbook', orderBook);
    }
  }

  private buildOrderBook(
    tokenId: string,
    bids: Array<{ price: string; size: string }>,
    asks: Array<{ price: string; size: string }>,
  ): OrderBook {
    const parsedBids = bids
      .map(b => ({ price: parseFloat(b.price), size: parseFloat(b.size) }))
      .sort((a, b) => b.price - a.price); // descending — best bid first

    const parsedAsks = asks
      .map(a => ({ price: parseFloat(a.price), size: parseFloat(a.size) }))
      .sort((a, b) => a.price - b.price); // ascending — best ask first

    return { tokenId, bids: parsedBids, asks: parsedAsks, timestamp: Date.now() };
  }

  /** Heartbeat every 30s */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 30000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /** Schedule auto-reconnect, clearing subscribedTokens so we re-subscribe after reconnect */
  private scheduleReconnect(tokenIds: string[]): void {
    if (this.disposed) return;
    if (this.reconnectTimer) return;

    this.subscribedTokens.clear();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.disposed) return;
      this.connect(tokenIds).catch(() => {});
    }, this.reconnectDelay);
  }

  /** Clean up all resources */
  dispose(): void {
    this.disposed = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }
    this.subscribedTokens.clear();
  }
}