import { config } from '../src/config.js';
import { StateStore } from '../src/simulation/state-store.js';

interface Trade {
  signalId: string;
  tokenA: string;
  tokenB: string;
  priceA: number;
  priceB: number;
  size: number;
  feeA: number;
  feeB: number;
  netPnL: number;
  timestamp: number;
}

interface DailyStats {
  date: string;
  tradeCount: number;
  volume: number;
  grossProfit: number;
  netProfit: number;
  winRate: number;
}

function parseArgs(): { trades: boolean; pnl: boolean; daily: boolean } {
  const args = process.argv.slice(2);
  const showAll = args.length === 0;
  return {
    trades: showAll || args.includes('--trades'),
    pnl: showAll || args.includes('--pnl'),
    daily: showAll || args.includes('--daily'),
  };
}

function openStore(): StateStore {
  try {
    return new StateStore(config.dbPath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Database error: ${message}`);
    process.exit(1);
  }
}

function getTrades(store: StateStore): Trade[] {
  return store.getAllTrades().map(fill => ({
    signalId: fill.signalId,
    tokenA: fill.tokenA,
    tokenB: fill.tokenB,
    priceA: fill.priceA,
    priceB: fill.priceB,
    size: fill.size,
    feeA: fill.feeA,
    feeB: fill.feeB,
    netPnL: fill.size * 1.0 - (fill.priceA + fill.priceB + fill.feeA + fill.feeB),
    timestamp: fill.timestamp,
  }));
}

function getPnL(store: StateStore): {
  cumulativePnL: number; totalTrades: number;
} {
  return store.getCumulativeStats();
}

function getDailyStats(store: StateStore): DailyStats[] {
  return store.getAllDailyStats().map(r => ({
    date: r.date,
    tradeCount: r.tradeCount,
    volume: r.volume,
    grossProfit: r.grossProfit,
    netProfit: r.netProfit,
    winRate: r.winRate,
  }));
}

function main(): void {
  const flags = parseArgs();
  const store = openStore();

  try {
    const output: Record<string, unknown> = {};

    if (flags.trades) {
      output.trades = getTrades(store);
    }
    if (flags.pnl) {
      output.pnl = getPnL(store);
    }
    if (flags.daily) {
      output.dailyStats = getDailyStats(store);
    }

    process.stdout.write(JSON.stringify(output));
  } finally {
    store.close();
  }
}

main();
