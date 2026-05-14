import { config } from '../config.js';
import { estimateOrderFillLikelihood } from './market-order-monitor.js';
import type { MonitorSnapshot, OrderSnapshot, OutcomeSnapshot, TradeSnapshot } from './market-order-monitor.js';

interface GammaEventResponse {
  slug: string;
  title: string;
  markets: GammaMarketResponse[];
}

interface GammaMarketResponse {
  conditionId: string;
  question: string;
  outcomes: string;
  clobTokenIds: string;
  groupItemTitle?: string;
  bestBid?: number;
  bestAsk?: number;
  volume24hr?: number;
  liquidity?: string | number;
}

interface ClobOpenOrderResponse {
  id: string;
  status: string;
  market: string;
  asset_id: string;
  side: string;
  original_size: string;
  size_matched: string;
  price: string;
  outcome: string;
  created_at: number;
}

interface ClobTradeResponse {
  id: string;
  taker_order_id: string;
  market: string;
  asset_id: string;
  side: string;
  size: string;
  price: string;
  status: string;
  match_time: string;
  outcome: string;
  maker_orders?: Array<{ order_id: string }>;
}

interface PaginatedResponse<T> {
  data: T[];
  next_cursor?: string;
}

export class PolymarketMonitorClient {
  async fetchSnapshot(eventSlug: string): Promise<MonitorSnapshot> {
    const event = await this.fetchEvent(eventSlug);
    const outcomes = buildOutcomeSnapshots(event);
    const marketIds = new Set(outcomes.map(outcome => outcome.conditionId));
    const tokenIds = new Set(outcomes.flatMap(outcome => [outcome.yesTokenId, outcome.noTokenId]));

    const [openOrdersWithoutLikelihood, trades] = await Promise.all([
      this.fetchOpenOrders(marketIds, tokenIds),
      this.fetchTrades(marketIds, tokenIds),
    ]);
    const outcomesByConditionId = new Map(outcomes.map(outcome => [outcome.conditionId, outcome]));
    const openOrders = openOrdersWithoutLikelihood.map(order => {
      const outcome = outcomesByConditionId.get(order.market);
      return outcome
        ? { ...order, fillLikelihood: estimateOrderFillLikelihood(order, outcome) }
        : order;
    });

    return {
      timestamp: Date.now(),
      eventSlug,
      eventTitle: event.title.trim(),
      outcomes,
      openOrders,
      trades,
    };
  }

  async sendTelegram(message: string): Promise<void> {
    if (!config.telegramBotToken || !config.telegramChatId) {
      throw new Error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID');
    }

    const url = `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept-Encoding': 'identity' },
      body: JSON.stringify({
        chat_id: config.telegramChatId,
        text: message,
        disable_web_page_preview: true,
      }),
    });

    if (!resp.ok) {
      throw new Error(`Telegram error: ${resp.status} ${await resp.text()}`);
    }
  }

  private async fetchEvent(eventSlug: string): Promise<GammaEventResponse> {
    const url = `${config.gammaApiUrl}/events?slug=${encodeURIComponent(eventSlug)}`;
    const events = await requestJson<GammaEventResponse[]>(url);
    const event = events[0];
    if (!event) {
      throw new Error(`Polymarket event not found: ${eventSlug}`);
    }
    return event;
  }

  private async fetchOpenOrders(marketIds: Set<string>, tokenIds: Set<string>): Promise<OrderSnapshot[]> {
    const orders = await this.fetchClobPage<ClobOpenOrderResponse>('/data/orders');
    return orders
      .filter(order => marketIds.has(order.market) || tokenIds.has(order.asset_id))
      .map(order => {
        const originalSize = parseNumber(order.original_size);
        const sizeMatched = parseNumber(order.size_matched);
        return {
          id: order.id,
          market: order.market,
          assetId: order.asset_id,
          outcome: order.outcome,
          side: order.side,
          price: parseNumber(order.price),
          originalSize,
          sizeMatched,
          remainingSize: Math.max(0, originalSize - sizeMatched),
          status: order.status,
          createdAt: order.created_at,
        };
      });
  }

  private async fetchTrades(marketIds: Set<string>, tokenIds: Set<string>): Promise<TradeSnapshot[]> {
    const params = config.polymarketWalletAddress
      ? { maker_address: config.polymarketWalletAddress }
      : undefined;
    const trades = await this.fetchClobPage<ClobTradeResponse>('/data/trades', params);

    return trades
      .filter(trade => marketIds.has(trade.market) || tokenIds.has(trade.asset_id))
      .map(trade => ({
        id: trade.id,
        market: trade.market,
        assetId: trade.asset_id,
        outcome: trade.outcome,
        side: trade.side,
        price: parseNumber(trade.price),
        size: parseNumber(trade.size),
        status: trade.status,
        matchTime: trade.match_time,
        orderIds: getTradeOrderIds(trade),
      }));
  }

  private async fetchClobPage<T>(path: string, params?: Record<string, string>): Promise<T[]> {
    const searchParams = new URLSearchParams(params);
    const url = `${config.clobRestUrl}${path}${searchParams.size > 0 ? `?${searchParams}` : ''}`;
    const headers = await buildClobHeaders('GET', path);
    const response = await requestJson<PaginatedResponse<T>>(url, { headers });
    return response.data ?? [];
  }
}

function buildOutcomeSnapshots(event: GammaEventResponse): OutcomeSnapshot[] {
  return event.markets.map(market => {
    const outcomes = parseStringArray(market.outcomes);
    const tokenIds = parseStringArray(market.clobTokenIds);
    const yesIndex = outcomes.findIndex(outcome => outcome.toLowerCase() === 'yes');
    const noIndex = outcomes.findIndex(outcome => outcome.toLowerCase() === 'no');
    const yesBid = numberOrNull(market.bestBid);
    const yesAsk = numberOrNull(market.bestAsk);

    return {
      conditionId: market.conditionId,
      question: market.question,
      outcome: market.groupItemTitle?.trim() || market.question,
      yesTokenId: tokenIds[yesIndex] ?? '',
      noTokenId: tokenIds[noIndex] ?? '',
      yesBid,
      yesAsk,
      noBid: yesAsk === null ? null : roundPrice(1 - yesAsk),
      noAsk: yesBid === null ? null : roundPrice(1 - yesBid),
      yesNoAskTotal: yesAsk === null || yesBid === null ? null : roundPrice(yesAsk + (1 - yesBid)),
      volume24hr: parseNumber(market.volume24hr),
      liquidity: parseNumber(market.liquidity),
    };
  });
}

async function buildClobHeaders(method: string, path: string): Promise<Record<string, string>> {
  if (!config.polymarketWalletAddress || !config.polymarketClobApiKey || !config.polymarketClobSecret || !config.polymarketClobPassphrase) {
    throw new Error('Missing Polymarket CLOB env vars');
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = await buildHmacSignature(config.polymarketClobSecret, timestamp, method, path);

  return {
    POLY_ADDRESS: config.polymarketWalletAddress,
    POLY_SIGNATURE: signature,
    POLY_TIMESTAMP: timestamp,
    POLY_API_KEY: config.polymarketClobApiKey,
    POLY_PASSPHRASE: config.polymarketClobPassphrase,
  };
}

async function buildHmacSignature(secret: string, timestamp: string, method: string, path: string): Promise<string> {
  const key = Buffer.from(secret.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const payload = new TextEncoder().encode(`${timestamp}${method}${path}`);
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, payload);
  return Buffer.from(signature).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(url, {
    ...init,
    headers: {
      'Accept-Encoding': 'identity',
      ...init?.headers,
    },
  });

  if (!resp.ok) {
    throw new Error(`Request failed: ${resp.status} ${resp.statusText} ${await resp.text()}`);
  }

  return await resp.json() as T;
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function getTradeOrderIds(trade: ClobTradeResponse): string[] {
  const orderIds = new Set<string>();
  if (trade.taker_order_id) orderIds.add(trade.taker_order_id);
  for (const makerOrder of trade.maker_orders ?? []) {
    if (makerOrder.order_id) orderIds.add(makerOrder.order_id);
  }
  return [...orderIds];
}

function parseNumber(value: string | number | undefined): number {
  if (value === undefined) return 0;
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function numberOrNull(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function roundPrice(value: number): number {
  return Math.round(value * 1000) / 1000;
}
