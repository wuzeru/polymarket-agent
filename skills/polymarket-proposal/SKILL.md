---
name: polymarket-proposal
description: Prepare Polymarket trading proposals with expiry-aware return structure and SQLite proposal tracking. Use whenever giving the user a Polymarket trading idea, arbitrage plan, market-making plan, or position recommendation.
---

# Polymarket Proposal

## When To Use

Use this skill before giving any Polymarket trading plan, including arbitrage, market-making, directional, or hedge proposals.

## Required Output

Every proposal must include:

1. Trading plan: market URL/slug, outcome, side, order type, target price, size, and whether it is maker/taker.
2. Expiry: UTC and Beijing time, plus approximate days to expiry.
3. Return structure in three scenarios:
   - both/hedged legs filled or intended full plan completed
   - only YES/long leg filled
   - only NO/hedge leg filled
4. Costs:
   - platform fee assumption (maker usually 0; taker depends on market category)
   - withdrawal/gas estimate
   - net profit, net ROI, and simple annualized ROI when expiry is known
5. Risk note: single-leg fill risk, liquidity/spread risk, and resolution-rule risk.

## Database Recording

Write every proposal to the SQLite database at `data/agent-state.db`, table `proposals`.

Required behavior:

- Use a stable `id`, e.g. `proposal-YYYYMMDD-short-slug`.
- Set `status` to `proposed` unless the user has already executed it.
- Fill `scenario_both_filled`, `scenario_yes_only`, and `scenario_no_only` with concise English or Chinese text.
- If a value is unknown, write `unknown` instead of leaving the field empty.
- Use:
  `npm run proposal:upsert -- '<proposal-json>'`
- Verify with:
  `npm run proposal:list`

## Fees Defaults

Use conservative defaults unless fresher verified data is available:

- Maker fee: `0`.
- Taker fee: use official Polymarket category fee if known; otherwise explicitly mark as an assumption.
- Polymarket withdrawal platform fee: `0`.
- Polygon gas/withdrawal cost: estimate a small range such as `0.01-0.05 USDC` unless measured.

## Do Not

- Do not present a plan without recording it in the `proposals` table.
- Do not call locked profit "net" until fees and withdrawal/gas assumptions are included.
- Do not ignore single-side fill risk for paired YES/NO strategies.
