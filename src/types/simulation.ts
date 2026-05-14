import { z } from 'zod';

/** PnL snapshot at a point in time */
export const PnLSnapshotSchema = z.object({
  timestamp: z.number(),
  cumulativePnL: z.number(),
  totalTrades: z.number(),
  totalVolume: z.number(),
  grossProfit: z.number(),
  netProfit: z.number(),
  winRate: z.number(),
  maxDrawdown: z.number(),
  sharpeRatio: z.number().nullable(),
});
export type PnLSnapshot = z.infer<typeof PnLSnapshotSchema>;

/** Daily statistics */
export const DailyStatsSchema = z.object({
  date: z.string(),
  tradeCount: z.number(),
  volume: z.number(),
  grossProfit: z.number(),
  netProfit: z.number(),
  winRate: z.number(),
});
export type DailyStats = z.infer<typeof DailyStatsSchema>;
