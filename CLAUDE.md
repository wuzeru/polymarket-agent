# Polymarket Agent

A paper trading agent for Polymarket prediction markets. Claude invokes skills on demand to fetch market data, scan for arbitrage opportunities, and report trading performance. **All trading is simulated — no real funds are ever used.**

## Architecture

```
Claude Code → invoke skill → npx tsx scripts/<script>.ts → JSON output → Claude interprets
```

State (trades, signals, PnL) persists across invocations via SQLite at `data/agent-state.db`.

## Skills

| Skill | Purpose | CLI |
|-------|---------|-----|
| `polymarket-fetch` | Fetch active YES/NO markets from Gamma API | `npx tsx scripts/fetch-markets.ts` |
| `polymarket-scan` | Scan for YES+NO arbitrage, simulate fills, persist state | `npx tsx scripts/scan-arb.ts [--duration 5000] [--min-profit 0.005]` |
| `polymarket-report` | Query trade history, PnL, and daily stats from SQLite | `npx tsx scripts/report.ts [--trades] [--pnl] [--daily]` |
| `skills/polymarket-proposal` | Required workflow for any Polymarket trading proposal; records proposals to SQLite `proposals` table | `npm run proposal:upsert -- '<proposal-json>'` |
| `skills/polymarket-executed-monitor` | Required workflow when user says a proposal was executed; adds executed proposals to monitoring | `npm run monitor:orders -- --once` |

## Proposal And Monitoring Rules

- Before giving any Polymarket trading plan, read and follow `skills/polymarket-proposal/SKILL.md`.
- Every Polymarket proposal must include trading plan, expiry, three-scenario return structure, fees/withdrawal assumptions, and a record in SQLite `proposals`.
- When the user says they executed or placed a proposed trade, read and follow `skills/polymarket-executed-monitor/SKILL.md`.
- The live monitor reads SQLite `proposals` and includes rows whose `status` is `executed` or `monitoring`.
- Keep CLOB credentials and Telegram credentials only in `.env`; never ask the user to paste private keys into chat.

## Workflow Examples

**Check available markets:**
```
Claude, what markets are available on Polymarket right now?
→ invokes polymarket-fetch → returns JSON with market list
```

**Run an arbitrage scan:**
```
Claude, scan for arbitrage opportunities for 10 seconds.
→ invokes polymarket-scan --duration 10000 → detects signals, simulates fills, outputs JSON
```

**Review performance:**
```
Claude, show me today's PnL.
→ invokes polymarket-report → queries SQLite → returns trade history + PnL stats
```

## Configuration

Copy `.env.example` to `.env` and customize:

| Variable | Default | Description |
|----------|---------|-------------|
| `INITIAL_BALANCE` | `1000` | Virtual starting balance (USDC) |
| `MIN_PROFIT_THRESHOLD` | `0.005` | Minimum profit to trigger a signal |
| `MAX_POSITION_SIZE` | `200` | Max position size per trade (USDC) |
| `YES_NO_ARB_COOLDOWN_MS` | `5000` | Cooldown between signals for same pair |
| `DB_PATH` | `data/agent-state.db` | SQLite database path |
| `LOG_LEVEL` | `info` | Logging level |

## Boundaries

- **Paper trading only** — no real transactions are submitted to the Polymarket CLOB. All fills are simulated against live order book snapshots.
- **Read-only data sources** — Gamma API and CLOB WebSocket are public, read-only endpoints.
- **No wallet integration** — the agent does not connect to any wallet or sign any transactions.

## Source Code

- `src/data/` — Gamma API client, CLOB WebSocket client, market cache
- `src/strategy/` — YES+NO arbitrage detector, signal bus
- `src/simulation/` — virtual order book, order simulator, PnL tracker, state store (SQLite)
- `src/types/` — Zod schemas for market, strategy, and simulation types
- `scripts/` — CLI entry points invoked by skills
