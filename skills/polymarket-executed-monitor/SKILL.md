---
name: polymarket-executed-monitor
description: Add executed Polymarket proposals to live monitoring. Use when the user says they executed, placed, filled, bought, sold, or followed a previously proposed Polymarket trading plan.
---

# Polymarket Executed Monitor

## When To Use

Use this skill whenever the user says a Polymarket proposal was executed or orders were placed, including phrases like:

- "我执行了这个方案"
- "我挂好了"
- "成交了"
- "按这个方案买了"
- "add this to monitoring"

## Required Workflow

1. Identify the proposal in the SQLite `proposals` table.
2. Update its `status`:
   - `executed` when orders were placed but not all legs are known filled.
   - `monitoring` when it should be actively watched.
   - `closed` only after the user says the position is closed or resolved.
3. Ensure the DB record has `eventSlug`, `marketSlug`, `conditionId`, `outcome`, prices, size, and expiry fields filled.
4. Upsert the DB record with `npm run proposal:upsert -- '<proposal-json>'`.
5. Restart or instruct restarting `npm run monitor:orders` so the monitor reloads the proposal DB.
6. Run `npm run monitor:orders -- --once` to verify the executed proposal appears in monitoring output when credentials are configured.

## Monitor Contract

The monitor reads the SQLite `proposals` table and includes every row with status `executed` or `monitoring`.

The monitor must keep writing JSON snapshots and terminal logs with:

- event slug
- open orders
- fill likelihood
- events detected
- Telegram status

## Safety

Never ask for private keys. CLOB credentials must remain in `.env`.
