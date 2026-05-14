export interface OutcomeSnapshot {
  conditionId: string;
  question: string;
  outcome: string;
  yesTokenId: string;
  noTokenId: string;
  yesBid: number | null;
  yesAsk: number | null;
  noBid: number | null;
  noAsk: number | null;
  yesNoAskTotal: number | null;
  volume24hr: number;
  liquidity: number;
}

export interface FillLikelihood {
  score: number;
  label: 'immediate' | 'high' | 'medium' | 'low' | 'unknown';
  reason: string;
}

export interface OrderSnapshot {
  id: string;
  market: string;
  assetId: string;
  outcome: string;
  side: string;
  price: number;
  originalSize: number;
  sizeMatched: number;
  remainingSize: number;
  status: string;
  createdAt: number;
  fillLikelihood?: FillLikelihood;
}

export interface TradeSnapshot {
  id: string;
  market: string;
  assetId: string;
  outcome: string;
  side: string;
  price: number;
  size: number;
  status: string;
  matchTime: string;
  orderIds: string[];
}

export interface MonitorSnapshot {
  timestamp: number;
  eventSlug: string;
  eventTitle: string;
  outcomes: OutcomeSnapshot[];
  openOrders: OrderSnapshot[];
  trades: TradeSnapshot[];
}

export type MonitorEvent =
  | {
      type: 'order_partially_filled';
      orderId: string;
      market: string;
      outcome: string;
      side: string;
      price: number;
      previousSizeMatched: number;
      currentSizeMatched: number;
      sizeDelta: number;
    }
  | {
      type: 'order_filled';
      orderId: string;
      market: string;
      tradeIds: string[];
    }
  | {
      type: 'order_missing';
      orderId: string;
      market: string;
    }
  | {
      type: 'new_order';
      orderId: string;
      market: string;
      outcome: string;
      side: string;
      price: number;
      remainingSize: number;
    }
  | {
      type: 'new_trade';
      tradeId: string;
      market: string;
      outcome: string;
      side: string;
      price: number;
      size: number;
      orderIds: string[];
    }
  | {
      type: 'price_moved';
      conditionId: string;
      outcome: string;
      previousYesBid: number | null;
      currentYesBid: number | null;
      previousYesAsk: number | null;
      currentYesAsk: number | null;
    };

export function detectMonitorEvents(
  previous: MonitorSnapshot | null,
  current: MonitorSnapshot,
  priceChangeThreshold: number,
): MonitorEvent[] {
  if (!previous) return [];

  const events: MonitorEvent[] = [];
  const previousOrders = new Map(previous.openOrders.map(order => [order.id, order]));
  const currentOrders = new Map(current.openOrders.map(order => [order.id, order]));
  const previousTradeIds = new Set(previous.trades.map(trade => trade.id));

  for (const order of current.openOrders) {
    const previousOrder = previousOrders.get(order.id);
    if (!previousOrder) {
      events.push({
        type: 'new_order',
        orderId: order.id,
        market: order.market,
        outcome: order.outcome,
        side: order.side,
        price: order.price,
        remainingSize: order.remainingSize,
      });
      continue;
    }

    const sizeDelta = order.sizeMatched - previousOrder.sizeMatched;
    if (sizeDelta > 0) {
      events.push({
        type: 'order_partially_filled',
        orderId: order.id,
        market: order.market,
        outcome: order.outcome,
        side: order.side,
        price: order.price,
        previousSizeMatched: previousOrder.sizeMatched,
        currentSizeMatched: order.sizeMatched,
        sizeDelta,
      });
    }
  }

  for (const order of previous.openOrders) {
    if (currentOrders.has(order.id)) continue;

    const matchingTrades = current.trades.filter(trade => trade.orderIds.includes(order.id));
    if (matchingTrades.length > 0) {
      events.push({
        type: 'order_filled',
        orderId: order.id,
        market: order.market,
        tradeIds: matchingTrades.map(trade => trade.id),
      });
    } else {
      events.push({
        type: 'order_missing',
        orderId: order.id,
        market: order.market,
      });
    }
  }

  for (const trade of current.trades) {
    if (previousTradeIds.has(trade.id)) continue;
    events.push({
      type: 'new_trade',
      tradeId: trade.id,
      market: trade.market,
      outcome: trade.outcome,
      side: trade.side,
      price: trade.price,
      size: trade.size,
      orderIds: trade.orderIds,
    });
  }

  const previousOutcomes = new Map(previous.outcomes.map(outcome => [outcome.conditionId, outcome]));
  for (const outcome of current.outcomes) {
    const previousOutcome = previousOutcomes.get(outcome.conditionId);
    if (!previousOutcome) continue;

    if (
      hasMoved(previousOutcome.yesBid, outcome.yesBid, priceChangeThreshold) ||
      hasMoved(previousOutcome.yesAsk, outcome.yesAsk, priceChangeThreshold)
    ) {
      events.push({
        type: 'price_moved',
        conditionId: outcome.conditionId,
        outcome: outcome.outcome,
        previousYesBid: previousOutcome.yesBid,
        currentYesBid: outcome.yesBid,
        previousYesAsk: previousOutcome.yesAsk,
        currentYesAsk: outcome.yesAsk,
      });
    }
  }

  return events;
}

export function estimateOrderFillLikelihood(order: OrderSnapshot, outcome: OutcomeSnapshot): FillLikelihood {
  const book = getOrderBookSide(order, outcome);
  if (!book) {
    return {
      score: 0,
      label: 'unknown',
      reason: '找不到该订单对应的 YES/NO 盘口',
    };
  }

  const { bid, ask } = book;
  if (bid === null || ask === null) {
    return {
      score: 0,
      label: 'unknown',
      reason: '盘口 bid/ask 不完整，无法估计成交概率',
    };
  }

  if (order.side === 'BUY') {
    return estimateBuyFill(order.price, bid, ask);
  }

  if (order.side === 'SELL') {
    return estimateSellFill(order.price, bid, ask);
  }

  return {
    score: 0,
    label: 'unknown',
    reason: `不支持的订单方向：${order.side}`,
  };
}

export function formatMonitorMessage(snapshot: MonitorSnapshot, events: MonitorEvent[]): string {
  const title = `Polymarket 监控：${snapshot.eventTitle}`;
  const priceLines = snapshot.outcomes
    .filter(outcome => outcome.outcome.includes('Stuttgart') || outcome.outcome.includes('Hoffenheim') || outcome.outcome.includes('Leverkusen'))
    .map(outcome => {
      const yesBid = formatPrice(outcome.yesBid);
      const yesAsk = formatPrice(outcome.yesAsk);
      const noAsk = formatPrice(outcome.noAsk);
      return `${outcome.outcome}: YES bid ${yesBid}, YES ask ${yesAsk}, NO ask ${noAsk}`;
    });

  const eventLines = events.map(formatMonitorEvent);
  const orderLine = `当前该市场 open orders: ${snapshot.openOrders.length}`;
  const orderLines = snapshot.openOrders.map(order => {
    const likelihood = order.fillLikelihood;
    if (!likelihood) {
      return `挂单: ${order.side} ${order.outcome} @ ${formatPrice(order.price)}, 剩余 ${order.remainingSize}`;
    }
    return `挂单: ${order.side} ${order.outcome} @ ${formatPrice(order.price)}, 剩余 ${order.remainingSize}, 成交可能性 ${Math.round(likelihood.score * 100)}% (${likelihood.label})`;
  });

  return [title, orderLine, ...orderLines, ...priceLines, ...eventLines].filter(Boolean).join('\n');
}

function formatMonitorEvent(event: MonitorEvent): string {
  switch (event.type) {
    case 'new_order':
      return `新挂单: ${event.side} ${event.outcome} @ ${formatPrice(event.price)}, 剩余 ${event.remainingSize}`;
    case 'order_partially_filled':
      return `部分成交: ${event.orderId} +${event.sizeDelta} @ ${formatPrice(event.price)} (${event.currentSizeMatched} 已成交)`;
    case 'order_filled':
      return `挂单成交/离开订单簿: ${event.orderId}, trades=${event.tradeIds.join(', ')}`;
    case 'order_missing':
      return `挂单不再开放但未找到成交记录: ${event.orderId}`;
    case 'new_trade':
      return `新成交: ${event.side} ${event.outcome} ${event.size} @ ${formatPrice(event.price)} (${event.tradeId})`;
    case 'price_moved':
      return `价格变化: ${event.outcome} YES ask ${formatPrice(event.previousYesAsk)} -> ${formatPrice(event.currentYesAsk)}`;
  }
}

function hasMoved(previous: number | null, current: number | null, threshold: number): boolean {
  if (previous === null || current === null) return false;
  return Math.abs(current - previous) >= threshold;
}

function estimateBuyFill(price: number, bid: number, ask: number): FillLikelihood {
  if (price >= ask) {
    return {
      score: 0.95,
      label: 'immediate',
      reason: `买价 ${formatPrice(price)} 已达到/超过卖一 ${formatPrice(ask)}，理论上可立即成交`,
    };
  }

  if (price < bid) {
    const distanceBehindBid = bid - price;
    const score = clamp(0.2 - distanceBehindBid * 2, 0.05, 0.2);
    return {
      score,
      label: 'low',
      reason: `买价 ${formatPrice(price)} 低于买一 ${formatPrice(bid)}，排在当前最佳买价后面`,
    };
  }

  const spread = Math.max(ask - bid, 0.001);
  const positionInSpread = (price - bid) / spread;
  const score = clamp(0.35 + positionInSpread * 0.45, 0.35, 0.8);

  return {
    score,
    label: score >= 0.65 ? 'high' : 'medium',
    reason: `买价位于 ${formatPrice(bid)}-${formatPrice(ask)} 价差内，越接近卖一越容易成交`,
  };
}

function estimateSellFill(price: number, bid: number, ask: number): FillLikelihood {
  if (price <= bid) {
    return {
      score: 0.95,
      label: 'immediate',
      reason: `卖价 ${formatPrice(price)} 已达到/低于买一 ${formatPrice(bid)}，理论上可立即成交`,
    };
  }

  if (price > ask) {
    const distanceBehindAsk = price - ask;
    const score = clamp(0.2 - distanceBehindAsk * 2, 0.05, 0.2);
    return {
      score,
      label: 'low',
      reason: `卖价 ${formatPrice(price)} 高于卖一 ${formatPrice(ask)}，排在当前最佳卖价后面`,
    };
  }

  const spread = Math.max(ask - bid, 0.001);
  const positionInSpread = (ask - price) / spread;
  const score = clamp(0.35 + positionInSpread * 0.45, 0.35, 0.8);

  return {
    score,
    label: score >= 0.65 ? 'high' : 'medium',
    reason: `卖价位于 ${formatPrice(bid)}-${formatPrice(ask)} 价差内，越接近买一越容易成交`,
  };
}

function getOrderBookSide(order: OrderSnapshot, outcome: OutcomeSnapshot): { bid: number | null; ask: number | null } | null {
  if (order.assetId === outcome.yesTokenId || order.outcome.toLowerCase() === 'yes') {
    return { bid: outcome.yesBid, ask: outcome.yesAsk };
  }

  if (order.assetId === outcome.noTokenId || order.outcome.toLowerCase() === 'no') {
    return { bid: outcome.noBid, ask: outcome.noAsk };
  }

  return null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value * 100) / 100));
}

function formatPrice(price: number | null): string {
  if (price === null) return 'n/a';
  return `${Math.round(price * 100)}¢`;
}
