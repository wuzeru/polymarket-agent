import { ProposalStore } from '../src/monitor/proposal-store.js';
import type { ProposalRecord } from '../src/monitor/proposal-store.js';

function parseProposalArg(): ProposalRecord {
  const json = process.argv[2];
  if (!json) {
    throw new Error('Usage: npm run proposal:upsert -- \'<proposal-json>\'');
  }
  return JSON.parse(json) as ProposalRecord;
}

const store = new ProposalStore();
try {
  const proposal = parseProposalArg();
  store.upsertProposal(proposal);
  process.stdout.write(JSON.stringify({ ok: true, id: proposal.id, status: proposal.status }, null, 2));
} finally {
  store.close();
}
