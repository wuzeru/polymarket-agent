import { z } from 'zod';

/** Signal emitted by a strategy detector */
export const SignalSchema = z.object({
  /** Unique signal ID */
  id: z.string(),
  /** Strategy that generated this signal */
  strategyName: z.string(),
  /** Signal type */
  type: z.enum(['YES_NO_ARB', 'TAIL_END', 'MARKET_MAKE']),
  /** Timestamp (ms) when signal was generated */
  timestamp: z.number(),
  /** Token ID for first leg */
  tokenA: z.string(),
  /** Token ID for second leg */
  tokenB: z.string(),
  /** Best ask price for tokenA */
  askA: z.number(),
  /** Best ask price for tokenB */
  askB: z.number(),
  /** Total cost (askA + askB) */
  totalCost: z.number(),
  /** Gross profit (1.0 - totalCost) */
  grossProfit: z.number(),
  /** Net profit after fees */
  netProfit: z.number(),
  /** Available depth for tokenA */
  depthA: z.number(),
  /** Available depth for tokenB */
  depthB: z.number(),
  /** Maximum size for this signal (min of depthA, depthB) */
  maxSize: z.number(),
});
export type Signal = z.infer<typeof SignalSchema>;

/** Fill event from order simulation */
export const FillSchema = z.object({
  signalId: z.string(),
  tokenA: z.string(),
  tokenB: z.string(),
  priceA: z.number(),
  priceB: z.number(),
  size: z.number(),
  feeA: z.number(),
  feeB: z.number(),
  timestamp: z.number(),
});
export type Fill = z.infer<typeof FillSchema>;
