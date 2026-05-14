import { z } from 'zod';
import { config } from '../config.js';
import type { Market } from '../types/market.js';

/** Raw market response from Gamma API */
const GammaMarketSchema = z.object({
  conditionId: z.string(),
  question: z.string(),
  /** JSON-encoded string array like '["Yes","No"]' */
  outcomes: z.string(),
  /** JSON-encoded string array of CLOB token IDs */
  clobTokenIds: z.string(),
  closed: z.boolean(),
  endDate: z.string().nullable(),
  /** Event ticker slug for grouping */
  events: z.array(z.object({ ticker: z.string() }).passthrough()).optional(),
  /** Best bid/ask from the market (optional, may not be present) */
  bestBid: z.number().optional(),
  bestAsk: z.number().optional(),
  /** Fee rates in basis points (e.g., 1000 = 0.1%?) */
  makerBaseFee: z.number().optional(),
  takerBaseFee: z.number().optional(),
});

const GammaMarketsResponseSchema = z.array(GammaMarketSchema);

/**
 * Gamma API client for fetching market metadata.
 * Connects to https://gamma-api.polymarket.com.
 */
export class GammaAPI {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? config.gammaApiUrl;
  }

  /**
   * Fetch active markets from Gamma API.
   * Returns Market objects with YES/NO token pairs.
   */
  async fetchMarkets(limit = 500): Promise<Market[]> {
    const url = `${this.baseUrl}/markets?limit=${limit}&closed=false`;
    // Disable compression: undici ProxyAgent doesn't auto-decompress
    const resp = await fetch(url, { headers: { 'Accept-Encoding': 'identity' } });

    if (!resp.ok) {
      throw new Error(`Gamma API error: ${resp.status} ${resp.statusText}`);
    }

    const raw = GammaMarketsResponseSchema.parse(await resp.json());
    const markets: Market[] = [];

    for (const m of raw) {
      if (m.closed) continue;

      // outcomes and clobTokenIds are JSON-encoded string arrays
      let outcomes: string[];
      let clobTokenIds: string[];
      try {
        outcomes = JSON.parse(m.outcomes);
        clobTokenIds = JSON.parse(m.clobTokenIds);
      } catch {
        continue; // malformed, skip
      }

      if (outcomes.length < 2 || clobTokenIds.length < 2) continue;

      // Find Yes/No token indices
      const yesIdx = outcomes.findIndex(o => o.toLowerCase() === 'yes');
      const noIdx = outcomes.findIndex(o => o.toLowerCase() === 'no');

      if (yesIdx === -1 || noIdx === -1) continue;

      markets.push({
        conditionId: m.conditionId,
        question: m.question,
        yesTokenId: clobTokenIds[yesIdx],
        noTokenId: clobTokenIds[noIdx],
        resolutionDate: m.endDate ? new Date(m.endDate).getTime() : null,
        marketType: 'binary',
        settled: m.closed,
      });
    }

    return markets;
  }

  /**
   * Get fee rates from a market's embedded fee data.
   * Falls back to { makerFee: 0, takerFee: 0.002 } (0.2%).
   *
   * makerBaseFee/takerBaseFee are in basis points (1 bp = 0.0001).
   */
  getFeesFromMarket(rawFeeData?: {
    makerBaseFee?: number;
    takerBaseFee?: number;
  }): { makerFee: number; takerFee: number } {
    if (!rawFeeData?.takerBaseFee && !rawFeeData?.makerBaseFee) {
      return { makerFee: 0, takerFee: 0.002 };
    }
    const bpsToRate = (bps: number | undefined, fallback: number) =>
      bps !== undefined ? bps / 10000 : fallback;

    return {
      makerFee: bpsToRate(rawFeeData.makerBaseFee, 0),
      takerFee: bpsToRate(rawFeeData.takerBaseFee, 0.002),
    };
  }
}