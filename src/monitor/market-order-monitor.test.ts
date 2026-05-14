import { describe, expect, it } from 'vitest';
import { detectMonitorEvents, estimateOrderFillLikelihood } from './market-order-monitor.js';
import type { MonitorSnapshot } from './market-order-monitor.js';

const baseSnapshot: MonitorSnapshot = {
  timestamp: 1000,
  eventSlug: 'bundesliga-top-4-finish',
  eventTitle: 'Bundesliga - Top 4 Finish',
  outcomes: [
    {
      conditionId: 'stuttgart',
      question: 'Will Stuttgart finish in the top 4?',
      outcome: 'Stuttgart',
      yesTokenId: 'yes-token',
      noTokenId: 'no-token',
      yesBid: 0.54,
      yesAsk: 0.66,
      noBid: 0.34,
      noAsk: 0.46,
      yesNoAskTotal: 1.12,
      volume24hr: 1000,
      liquidity: 2000,
    },
  ],
  openOrders: [
    {
      id: 'order-1',
      market: 'stuttgart',
      assetId: 'yes-token',
      outcome: 'Yes',
      side: 'BUY',
      price: 0.56,
      originalSize: 100,
      sizeMatched: 0,
      remainingSize: 100,
      status: 'OPEN',
      createdAt: 100,
    },
  ],
  trades: [],
};

describe('detectMonitorEvents', () => {
  it('notifies when an open order becomes partially filled', () => {
    const current: MonitorSnapshot = {
      ...baseSnapshot,
      timestamp: 2000,
      openOrders: [
        {
          ...baseSnapshot.openOrders[0],
          sizeMatched: 25,
          remainingSize: 75,
        },
      ],
    };

    const events = detectMonitorEvents(baseSnapshot, current, 0.05);

    expect(events).toEqual([
      expect.objectContaining({
        type: 'order_partially_filled',
        orderId: 'order-1',
        sizeDelta: 25,
      }),
    ]);
  });

  it('notifies when an open order disappears and a matching fill appears', () => {
    const current: MonitorSnapshot = {
      ...baseSnapshot,
      timestamp: 2000,
      openOrders: [],
      trades: [
        {
          id: 'trade-1',
          market: 'stuttgart',
          assetId: 'yes-token',
          outcome: 'Yes',
          side: 'BUY',
          price: 0.56,
          size: 100,
          status: 'CONFIRMED',
          matchTime: '2026-05-14T06:30:00Z',
          orderIds: ['order-1'],
        },
      ],
    };

    const events = detectMonitorEvents(baseSnapshot, current, 0.05);

    expect(events).toEqual([
      expect.objectContaining({
        type: 'order_filled',
        orderId: 'order-1',
        tradeIds: ['trade-1'],
      }),
      expect.objectContaining({
        type: 'new_trade',
        tradeId: 'trade-1',
      }),
    ]);
  });

  it('notifies when market prices move by at least the configured threshold', () => {
    const current: MonitorSnapshot = {
      ...baseSnapshot,
      timestamp: 2000,
      outcomes: [
        {
          ...baseSnapshot.outcomes[0],
          yesAsk: 0.72,
          noAsk: 0.4,
        },
      ],
    };

    const events = detectMonitorEvents(baseSnapshot, current, 0.05);

    expect(events).toEqual([
      expect.objectContaining({
        type: 'price_moved',
        conditionId: 'stuttgart',
        previousYesAsk: 0.66,
        currentYesAsk: 0.72,
      }),
    ]);
  });
});

describe('estimateOrderFillLikelihood', () => {
  it('rates a buy order near the ask as high likelihood', () => {
    const likelihood = estimateOrderFillLikelihood(
      {
        id: 'order-yes',
        market: 'stuttgart',
        assetId: 'yes-token',
        outcome: 'Yes',
        side: 'BUY',
        price: 0.56,
        originalSize: 5,
        sizeMatched: 0,
        remainingSize: 5,
        status: 'LIVE',
        createdAt: 100,
      },
      {
        conditionId: 'stuttgart',
        question: 'Will Stuttgart finish in the top 4?',
        outcome: 'Stuttgart',
        yesTokenId: 'yes-token',
        noTokenId: 'no-token',
        yesBid: 0.41,
        yesAsk: 0.61,
        noBid: 0.39,
        noAsk: 0.59,
        yesNoAskTotal: 1.2,
        volume24hr: 221,
        liquidity: 490.5337,
      },
    );

    expect(likelihood.score).toBeGreaterThanOrEqual(0.65);
    expect(likelihood.label).toBe('high');
  });

  it('rates a buy order behind the best bid as low likelihood', () => {
    const likelihood = estimateOrderFillLikelihood(
      {
        id: 'order-no',
        market: 'stuttgart',
        assetId: 'no-token',
        outcome: 'No',
        side: 'BUY',
        price: 0.38,
        originalSize: 5,
        sizeMatched: 0,
        remainingSize: 5,
        status: 'LIVE',
        createdAt: 100,
      },
      {
        conditionId: 'stuttgart',
        question: 'Will Stuttgart finish in the top 4?',
        outcome: 'Stuttgart',
        yesTokenId: 'yes-token',
        noTokenId: 'no-token',
        yesBid: 0.41,
        yesAsk: 0.61,
        noBid: 0.39,
        noAsk: 0.59,
        yesNoAskTotal: 1.2,
        volume24hr: 221,
        liquidity: 490.5337,
      },
    );

    expect(likelihood.score).toBeLessThanOrEqual(0.25);
    expect(likelihood.label).toBe('low');
  });
});
