import { BaseStrategy } from './base.js';
import type { Signal, Fill } from '../types/strategy.js';
import type { MarketCache } from '../data/market-cache.js';
import type { Market, FeeRate } from '../types/market.js';
import { config } from '../config.js';

/**
 * YES+NO arbitrage strategy detector.
 *
 * Core logic: for each mutually exclusive YES/NO token pair,
 * if (bestAsk(YES) + bestAsk(NO)) < 1.0, buying both yields
 * a risk-free profit of 1.0 - totalCost - fees.
 */
export class YesNoArbDetector extends BaseStrategy {
  readonly name = 'YesNoArb';
  private markets: Market[] = [];
  private feeCache = new Map<string, FeeRate>();
  private lastSignalTime = new Map<string, number>();

  /** Set the list of markets to scan (from Gamma API) */
  setMarkets(markets: Market[]): void {
    this.markets = markets;
  }

  /** Update fee rate for a token */
  setFeeRate(feeRate: FeeRate): void {
    this.feeCache.set(feeRate.tokenId, feeRate);
  }

  detect(cache: MarketCache): Signal[] {
    if (!config.yesNoArbEnabled) return [];
    if (this.markets.length === 0) return [];

    const signals: Signal[] = [];
    const now = Date.now();

    for (const market of this.markets) {
      if (market.settled) continue;

      const pairKey = `${market.yesTokenId}|${market.noTokenId}`;
      const lastTime = this.lastSignalTime.get(pairKey) ?? 0;

      // Cooldown check: skip if within cooldown period
      if (now - lastTime < config.yesNoArbCooldownMs) continue;

      // Must have fresh data for both tokens
      if (!cache.hasToken(market.yesTokenId) || !cache.hasToken(market.noTokenId)) continue;

      const askA = cache.getBestAsk(market.yesTokenId);
      const askB = cache.getBestAsk(market.noTokenId);

      if (askA === null || askB === null) continue;
      if (askA <= 0 || askB <= 0) continue;

      const totalCost = askA + askB;

      // Only trigger if total cost is below 1.0
      if (totalCost >= 1.0) continue;

      const grossProfit = 1.0 - totalCost;

      // Estimate fees (taker fee for both legs, fallback to 0.2% each)
      const feeA = this.feeCache.get(market.yesTokenId)?.takerFee ?? 0.002;
      const feeB = this.feeCache.get(market.noTokenId)?.takerFee ?? 0.002;
      const feeEstimate = (askA * feeA) + (askB * feeB);
      const netProfit = grossProfit - feeEstimate;

      // Must exceed minimum profit threshold
      if (netProfit <= config.minProfitThreshold) continue;

      const depthA = cache.getAvailableDepth(market.yesTokenId, 'ask');
      const depthB = cache.getAvailableDepth(market.noTokenId, 'ask');

      if (depthA <= 0 || depthB <= 0) continue;

      const maxSize = Math.min(depthA, depthB, config.maxPositionSize);

      const signal: Signal = {
        id: `arb-${now}-${pairKey}`,
        strategyName: this.name,
        type: 'YES_NO_ARB',
        timestamp: now,
        tokenA: market.yesTokenId,
        tokenB: market.noTokenId,
        askA,
        askB,
        totalCost,
        grossProfit,
        netProfit,
        depthA,
        depthB,
        maxSize,
      };

      signals.push(signal);
      this.lastSignalTime.set(pairKey, now);
    }

    return signals;
  }

  onFill(_fill: Fill): void {
    // Track fills for post-trade analysis if needed
  }

  onResolution(_marketId: string, _winner: string): void {
    // Handle resolution: determine which leg was correct and final PnL
  }
}