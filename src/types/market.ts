import { z } from 'zod';

/** Level in order book: price + size */
export const LevelSchema = z.object({
  price: z.number().positive(),
  size: z.number().positive(),
});
export type Level = z.infer<typeof LevelSchema>;

/** Order book for a single token */
export const OrderBookSchema = z.object({
  tokenId: z.string(),
  bids: z.array(LevelSchema),
  asks: z.array(LevelSchema),
  timestamp: z.number(),
});
export type OrderBook = z.infer<typeof OrderBookSchema>;

/** Market info (YES + NO pair for a condition) */
export const MarketSchema = z.object({
  conditionId: z.string(),
  question: z.string(),
  /** Token ID for YES outcome */
  yesTokenId: z.string(),
  /** Token ID for NO outcome */
  noTokenId: z.string(),
  /** UNIX timestamp when market resolves, null if open */
  resolutionDate: z.number().nullable(),
  /** 'binary' | 'multi' */
  marketType: z.enum(['binary', 'multi']),
  /** Whether market has been settled */
  settled: z.boolean(),
});
export type Market = z.infer<typeof MarketSchema>;

/** Fee rate response from Gamma API */
export const FeeRateSchema = z.object({
  tokenId: z.string(),
  makerFee: z.number(),
  takerFee: z.number(),
});
export type FeeRate = z.infer<typeof FeeRateSchema>;
