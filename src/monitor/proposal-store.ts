import Database from 'better-sqlite3';
import { config } from '../config.js';

export interface ProposalRecord {
  id: string;
  createdAt: string;
  eventSlug: string;
  marketSlug: string;
  conditionId: string;
  outcome: string;
  yesPrice: number;
  noPrice: number;
  size: number;
  expiryUtc: string;
  expiryBj: string;
  totalCost: number;
  grossPayout: number;
  grossProfit: number;
  estimatedPlatformFee: string;
  estimatedWithdrawalCost: string;
  netProfit: string;
  netRoi: string;
  simpleAnnualizedRoi: string;
  scenarioBothFilled: string;
  scenarioYesOnly: string;
  scenarioNoOnly: string;
  status: string;
  notes: string;
}

interface ProposalRow {
  id: string;
  created_at: string;
  event_slug: string;
  market_slug: string;
  condition_id: string;
  outcome: string;
  yes_price: number;
  no_price: number;
  size: number;
  expiry_utc: string;
  expiry_bj: string;
  total_cost: number;
  gross_payout: number;
  gross_profit: number;
  estimated_platform_fee: string;
  estimated_withdrawal_cost: string;
  net_profit: string;
  net_roi: string;
  simple_annualized_roi: string;
  scenario_both_filled: string;
  scenario_yes_only: string;
  scenario_no_only: string;
  status: string;
  notes: string;
}

export class ProposalStore {
  private db: Database.Database;

  constructor(dbPath = config.dbPath) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initialize();
  }

  upsertProposal(proposal: ProposalRecord): void {
    this.db.prepare(`
      INSERT INTO proposals (
        id, created_at, event_slug, market_slug, condition_id, outcome,
        yes_price, no_price, size, expiry_utc, expiry_bj, total_cost,
        gross_payout, gross_profit, estimated_platform_fee,
        estimated_withdrawal_cost, net_profit, net_roi,
        simple_annualized_roi, scenario_both_filled, scenario_yes_only,
        scenario_no_only, status, notes, updated_at
      ) VALUES (
        @id, @createdAt, @eventSlug, @marketSlug, @conditionId, @outcome,
        @yesPrice, @noPrice, @size, @expiryUtc, @expiryBj, @totalCost,
        @grossPayout, @grossProfit, @estimatedPlatformFee,
        @estimatedWithdrawalCost, @netProfit, @netRoi,
        @simpleAnnualizedRoi, @scenarioBothFilled, @scenarioYesOnly,
        @scenarioNoOnly, @status, @notes, strftime('%Y-%m-%dT%H:%M:%fZ','now')
      )
      ON CONFLICT(id) DO UPDATE SET
        event_slug = excluded.event_slug,
        market_slug = excluded.market_slug,
        condition_id = excluded.condition_id,
        outcome = excluded.outcome,
        yes_price = excluded.yes_price,
        no_price = excluded.no_price,
        size = excluded.size,
        expiry_utc = excluded.expiry_utc,
        expiry_bj = excluded.expiry_bj,
        total_cost = excluded.total_cost,
        gross_payout = excluded.gross_payout,
        gross_profit = excluded.gross_profit,
        estimated_platform_fee = excluded.estimated_platform_fee,
        estimated_withdrawal_cost = excluded.estimated_withdrawal_cost,
        net_profit = excluded.net_profit,
        net_roi = excluded.net_roi,
        simple_annualized_roi = excluded.simple_annualized_roi,
        scenario_both_filled = excluded.scenario_both_filled,
        scenario_yes_only = excluded.scenario_yes_only,
        scenario_no_only = excluded.scenario_no_only,
        status = excluded.status,
        notes = excluded.notes,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    `).run(proposal);
  }

  getMonitoredEventSlugs(): string[] {
    const rows = this.db.prepare(`
      SELECT DISTINCT event_slug
      FROM proposals
      WHERE status IN ('executed', 'monitoring')
        AND event_slug != ''
      ORDER BY event_slug
    `).all() as Array<{ event_slug: string }>;

    return rows.map(row => row.event_slug);
  }

  getAllProposals(): ProposalRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM proposals ORDER BY created_at DESC, id DESC
    `).all() as ProposalRow[];

    return rows.map(rowToProposal);
  }

  close(): void {
    this.db.close();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS proposals (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        event_slug TEXT NOT NULL,
        market_slug TEXT NOT NULL,
        condition_id TEXT NOT NULL,
        outcome TEXT NOT NULL,
        yes_price REAL NOT NULL,
        no_price REAL NOT NULL,
        size REAL NOT NULL,
        expiry_utc TEXT NOT NULL,
        expiry_bj TEXT NOT NULL,
        total_cost REAL NOT NULL,
        gross_payout REAL NOT NULL,
        gross_profit REAL NOT NULL,
        estimated_platform_fee TEXT NOT NULL,
        estimated_withdrawal_cost TEXT NOT NULL,
        net_profit TEXT NOT NULL,
        net_roi TEXT NOT NULL,
        simple_annualized_roi TEXT NOT NULL,
        scenario_both_filled TEXT NOT NULL,
        scenario_yes_only TEXT NOT NULL,
        scenario_no_only TEXT NOT NULL,
        status TEXT NOT NULL,
        notes TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_proposals_status_event
        ON proposals(status, event_slug);
    `);
  }
}

function rowToProposal(row: ProposalRow): ProposalRecord {
  return {
    id: row.id,
    createdAt: row.created_at,
    eventSlug: row.event_slug,
    marketSlug: row.market_slug,
    conditionId: row.condition_id,
    outcome: row.outcome,
    yesPrice: row.yes_price,
    noPrice: row.no_price,
    size: row.size,
    expiryUtc: row.expiry_utc,
    expiryBj: row.expiry_bj,
    totalCost: row.total_cost,
    grossPayout: row.gross_payout,
    grossProfit: row.gross_profit,
    estimatedPlatformFee: row.estimated_platform_fee,
    estimatedWithdrawalCost: row.estimated_withdrawal_cost,
    netProfit: row.net_profit,
    netRoi: row.net_roi,
    simpleAnnualizedRoi: row.simple_annualized_roi,
    scenarioBothFilled: row.scenario_both_filled,
    scenarioYesOnly: row.scenario_yes_only,
    scenarioNoOnly: row.scenario_no_only,
    status: row.status,
    notes: row.notes,
  };
}
