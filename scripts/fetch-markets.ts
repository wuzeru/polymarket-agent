import { GammaAPI } from '../src/data/gamma-api.js';

async function main(): Promise<void> {
  const gamma = new GammaAPI();

  try {
    const markets = await gamma.fetchMarkets();
    const output = {
      markets,
      count: markets.length,
      timestamp: Date.now(),
    };
    process.stdout.write(JSON.stringify(output));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Fetch error: ${message}`);
    process.exit(1);
  }
}

main();
