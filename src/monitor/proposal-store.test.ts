import { describe, expect, it } from 'vitest';
import { ProposalStore } from './proposal-store.js';
import type { ProposalRecord } from './proposal-store.js';

const proposal: ProposalRecord = {
  id: 'proposal-1',
  createdAt: '2026-05-14T10:16:00Z',
  eventSlug: 'bundesliga-top-4-finish',
  marketSlug: 'will-stuttgart-finish-in-the-top-4-of-the-bundesliga-202526-standings',
  conditionId: '0xcondition',
  outcome: 'Stuttgart',
  yesPrice: 0.56,
  noPrice: 0.38,
  size: 5,
  expiryUtc: '2026-05-28T00:00:00Z',
  expiryBj: '2026-05-28T08:00:00+08:00',
  totalCost: 4.7,
  grossPayout: 5,
  grossProfit: 0.3,
  estimatedPlatformFee: '0',
  estimatedWithdrawalCost: '0.01-0.05',
  netProfit: '0.25-0.30',
  netRoi: '5.3%-6.4%',
  simpleAnnualizedRoi: '~142%-171%',
  scenarioBothFilled: 'locked profit',
  scenarioYesOnly: 'directional YES',
  scenarioNoOnly: 'directional NO',
  status: 'executed',
  notes: 'test',
};

describe('ProposalStore', () => {
  it('stores proposals and returns monitored event slugs', () => {
    const store = new ProposalStore(':memory:');
    store.upsertProposal(proposal);

    expect(store.getMonitoredEventSlugs()).toEqual(['bundesliga-top-4-finish']);
    expect(store.getAllProposals()).toEqual([proposal]);

    store.close();
  });

  it('does not monitor proposals that are only proposed', () => {
    const store = new ProposalStore(':memory:');
    store.upsertProposal({ ...proposal, id: 'proposal-2', status: 'proposed' });

    expect(store.getMonitoredEventSlugs()).toEqual([]);

    store.close();
  });
});
