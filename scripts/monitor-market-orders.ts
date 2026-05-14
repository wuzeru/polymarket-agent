import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { config } from '../src/config.js';
import { detectMonitorEvents, formatMonitorMessage } from '../src/monitor/market-order-monitor.js';
import { PolymarketMonitorClient } from '../src/monitor/polymarket-monitor-client.js';
import { ProposalStore } from '../src/monitor/proposal-store.js';
import type { MonitorEvent, MonitorSnapshot } from '../src/monitor/market-order-monitor.js';

const combinedLatestPath = 'data/market-order-monitor-latest.json';

interface MonitorState {
  lastSnapshot: MonitorSnapshot | null;
}

interface LatestOutput {
  snapshots: Array<{
    eventSlug: string;
    snapshot: MonitorSnapshot;
    events: MonitorEvent[];
  }>;
}

function parseArgs(): { once: boolean } {
  return { once: process.argv.includes('--once') };
}

async function main(): Promise<void> {
  const { once } = parseArgs();
  const client = new PolymarketMonitorClient();

  await runOnce(client);
  if (once) return;

  setInterval(() => {
    runOnce(client).catch(async err => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Monitor error: ${message}`);
      try {
        await client.sendTelegram(`Polymarket 监控异常：${message}`);
      } catch {
        // Avoid recursive error loops if Telegram is unavailable.
      }
    });
  }, config.monitorIntervalMs);
}

async function runOnce(client: PolymarketMonitorClient): Promise<void> {
  const eventSlugs = await getMonitoredEventSlugs();
  const outputs: LatestOutput['snapshots'] = [];

  for (const eventSlug of eventSlugs) {
    const statePath = getStatePath(eventSlug);
    const latestPath = getLatestPath(eventSlug);
    const state = await readState(statePath);
    const snapshot = await client.fetchSnapshot(eventSlug);
    const events = detectMonitorEvents(
      state.lastSnapshot,
      snapshot,
      config.monitorPriceChangeCents / 100,
    );

    await writeJson(latestPath, { snapshot, events });
    await writeJson(statePath, { lastSnapshot: snapshot } satisfies MonitorState);
    outputs.push({ eventSlug, snapshot, events });

    if ((!state.lastSnapshot || events.length > 0) && config.telegramBotToken && config.telegramChatId) {
      await client.sendTelegram(formatMonitorMessage(snapshot, events));
    }
  }

  await writeJson(combinedLatestPath, { snapshots: outputs } satisfies LatestOutput);
  process.stdout.write(`${JSON.stringify({
    timestamp: Date.now(),
    monitoredEvents: eventSlugs,
    events: outputs.reduce((sum, output) => sum + output.events.length, 0),
    openOrders: outputs.reduce((sum, output) => sum + output.snapshot.openOrders.length, 0),
    orders: outputs.flatMap(output => output.snapshot.openOrders.map(order => ({
      eventSlug: output.eventSlug,
      outcome: order.outcome,
      side: order.side,
      price: order.price,
      remainingSize: order.remainingSize,
      fillLikelihood: order.fillLikelihood
        ? {
            score: order.fillLikelihood.score,
            percent: Math.round(order.fillLikelihood.score * 100),
            label: order.fillLikelihood.label,
            reason: order.fillLikelihood.reason,
          }
        : null,
    }))),
    telegramConfigured: Boolean(config.telegramBotToken && config.telegramChatId),
  })}\n`);
}

async function readState(path: string): Promise<MonitorState> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as MonitorState;
  } catch {
    return { lastSnapshot: null };
  }
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`);
}

async function getMonitoredEventSlugs(): Promise<string[]> {
  const slugs = new Set([config.monitorEventSlug]);
  try {
    const proposalStore = new ProposalStore(config.dbPath);
    for (const eventSlug of proposalStore.getMonitoredEventSlugs()) {
      slugs.add(eventSlug);
    }
    proposalStore.close();
  } catch {
    // Proposal DB monitoring is optional for existing monitor behavior.
  }

  return [...slugs].filter(Boolean);
}

function getLatestPath(eventSlug: string): string {
  return `data/${eventSlug}-latest.json`;
}

function getStatePath(eventSlug: string): string {
  return `data/${eventSlug}-order-state.json`;
}

main().catch(err => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Monitor error: ${message}`);
  process.exit(1);
});
