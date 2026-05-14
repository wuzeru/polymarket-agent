import { GammaAPI } from '../src/data/gamma-api.js';
import { CLOBWebSocket } from '../src/data/clob-ws.js';
import { MarketCache } from '../src/data/market-cache.js';
import { YesNoArbDetector } from '../src/strategy/yes-no-arb.js';
import { VirtualBook } from '../src/simulation/virtual-book.js';
import { OrderSim } from '../src/simulation/order-sim.js';
import { PnLTracker } from '../src/simulation/pnl-tracker.js';
import { StateStore } from '../src/simulation/state-store.js';
import { config } from '../src/config.js';
import type { OrderBook } from '../src/types/market.js';
import type { Signal, Fill } from '../src/types/strategy.js';

function parseArgs(): { duration: number; minProfit: number } {
  const args = process.argv.slice(2);
  let duration = 5000;
  let minProfit = 0.005;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--duration' && args[i + 1]) {
      duration = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--min-profit' && args[i + 1]) {
      minProfit = parseFloat(args[i + 1]);
      i++;
    }
  }

  return { duration: Math.max(1000, duration), minProfit };
}

async function main(): Promise<void> {
  const { duration, minProfit } = parseArgs();
  const output: Record<string, unknown> = {};
  const signals: Signal[] = [];
  const fills: Fill[] = [];
  let snapshotCount = 0;

  // -- Initialize components --
  const stateStore = new StateStore(config.dbPath);
  const gamma = new GammaAPI();
  const cache = new MarketCache();
  const virtualBook = new VirtualBook();
  const orderSim = new OrderSim(virtualBook);
  const pnlTracker = new PnLTracker();

  // Load persisted PnL
  const { cumulativePnL } = stateStore.getCumulativeStats();
  pnlTracker.loadState(cumulativePnL);
  orderSim.attachPnL(pnlTracker);

  // -- Fetch markets --
  const markets = await gamma.fetchMarkets();
  output.markets = { count: markets.length };

  if (markets.length === 0) {
    process.stdout.write(JSON.stringify({ markets: { count: 0 }, signals: [], fills: [], pnl: null }));
    stateStore.close();
    return;
  }

  // -- Setup strategy --
  const yesNoArb = new YesNoArbDetector();
  yesNoArb.setMarkets(markets);

  const allTokenIds = markets.flatMap(m => [m.yesTokenId, m.noTokenId]);

  // -- Connect WebSocket --
  const ws = new CLOBWebSocket();

  ws.on('orderbook', (orderBook: OrderBook) => {
    snapshotCount++;
    cache.update(orderBook);
    virtualBook.refresh(orderBook.tokenId, orderBook.asks, orderBook.timestamp);
  });

  try {
    await ws.connect(allTokenIds);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`WebSocket connection failed: ${message}`);
    stateStore.close();
    process.exit(1);
  }

  // -- Wait for data and detect signals --
  await new Promise<void>((resolve) => {
    const pollInterval = setInterval(() => {
      const detected = yesNoArb.detect(cache);
      for (const sig of detected) {
        signals.push(sig);
        stateStore.saveSignal(sig);

        if (sig.netProfit > 0) {
          try {
            const fill = orderSim.simulate(sig);
            fills.push(fill);
            stateStore.saveFill(fill);
          } catch {
            // insufficient depth — skip
          }
        }
      }
    }, 200);

    setTimeout(() => {
      clearInterval(pollInterval);
      resolve();
    }, duration);
  });

  // -- Persist final state --
  const snapshot = pnlTracker.snapshot();
  stateStore.persistSnapshot(snapshot);
  stateStore.close();

  // -- Cleanup WS --
  ws.dispose();

  // -- Output JSON --
  output.snapshots = snapshotCount;
  output.signals = signals;
  output.fills = fills;
  output.pnl = {
    cumulativePnL: snapshot.cumulativePnL,
    totalTrades: snapshot.totalTrades,
    totalVolume: snapshot.totalVolume,
    netProfit: snapshot.netProfit,
  };

  process.stdout.write(JSON.stringify(output));
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Scan error: ${message}`);
  process.exit(1);
});
