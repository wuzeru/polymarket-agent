import { ProposalStore } from '../src/monitor/proposal-store.js';

const store = new ProposalStore();
try {
  process.stdout.write(JSON.stringify({ proposals: store.getAllProposals() }, null, 2));
} finally {
  store.close();
}
