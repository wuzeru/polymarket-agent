import { z } from 'zod';
import { config as dotenvConfig } from 'dotenv';
import { setGlobalDispatcher, ProxyAgent } from 'undici';

// Load .env file
dotenvConfig();

// Honor HTTPS_PROXY / HTTP_PROXY so Node.js built-in fetch works behind Surge/system proxies
const proxyUrl = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY;
if (proxyUrl) {
  setGlobalDispatcher(new ProxyAgent(proxyUrl));
}

const envSchema = z.object({
  MIN_PROFIT_THRESHOLD: z.coerce.number().default(0.005),
  MAX_POSITION_SIZE: z.coerce.number().default(200),
  MARKET_TYPES: z.enum(['single', 'binary', 'all']).default('single'),
  YES_NO_ARB_ENABLED: z.coerce.boolean().default(true),
  YES_NO_ARB_COOLDOWN_MS: z.coerce.number().default(5000),
  WS_RECONNECT_DELAY: z.coerce.number().default(1000),
  CACHE_STALE_THRESHOLD_MS: z.coerce.number().default(2000),
  INITIAL_BALANCE: z.coerce.number().default(1000),
  DB_PATH: z.string().default('data/agent-state.db'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  CLOB_WS_URL: z.string().default('wss://ws-subscriptions-clob.polymarket.com/ws/market'),
  CLOB_REST_URL: z.string().default('https://clob.polymarket.com'),
  GAMMA_API_URL: z.string().default('https://gamma-api.polymarket.com'),
  POLYMARKET_WALLET_ADDRESS: z.string().optional(),
  POLYMARKET_CLOB_API_KEY: z.string().optional(),
  POLYMARKET_CLOB_SECRET: z.string().optional(),
  POLYMARKET_CLOB_PASSPHRASE: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  MONITOR_EVENT_SLUG: z.string().default('bundesliga-top-4-finish'),
  MONITOR_INTERVAL_MS: z.coerce.number().default(300000),
  MONITOR_PRICE_CHANGE_CENTS: z.coerce.number().default(5),
});

const env = envSchema.parse(process.env);

export const config = {
  /** Minimum profit (USDC) to trigger a signal */
  minProfitThreshold: env.MIN_PROFIT_THRESHOLD,
  /** Maximum position size per trade (USDC) */
  maxPositionSize: env.MAX_POSITION_SIZE,
  /** Market types to filter */
  marketTypes: env.MARKET_TYPES,
  /** Whether YES+NO arb strategy is enabled */
  yesNoArbEnabled: env.YES_NO_ARB_ENABLED,
  /** Cooldown between signals for same token pair (ms) */
  yesNoArbCooldownMs: env.YES_NO_ARB_COOLDOWN_MS,
  /** WebSocket reconnect delay (ms) */
  wsReconnectDelay: env.WS_RECONNECT_DELAY,
  /** Cache stale threshold (ms) */
  cacheStaleThresholdMs: env.CACHE_STALE_THRESHOLD_MS,
  /** Virtual starting balance (USDC) */
  initialBalance: env.INITIAL_BALANCE,
  /** SQLite database path for persistent state */
  dbPath: env.DB_PATH,
  /** Log level */
  logLevel: env.LOG_LEVEL,
  /** CLOB WebSocket URL */
  clobWsUrl: env.CLOB_WS_URL,
  /** CLOB REST URL */
  clobRestUrl: env.CLOB_REST_URL,
  /** Gamma API base URL */
  gammaApiUrl: env.GAMMA_API_URL,
  /** Wallet address used for read-only CLOB order monitoring */
  polymarketWalletAddress: env.POLYMARKET_WALLET_ADDRESS,
  /** Polymarket CLOB API key */
  polymarketClobApiKey: env.POLYMARKET_CLOB_API_KEY,
  /** Polymarket CLOB API secret */
  polymarketClobSecret: env.POLYMARKET_CLOB_SECRET,
  /** Polymarket CLOB API passphrase */
  polymarketClobPassphrase: env.POLYMARKET_CLOB_PASSPHRASE,
  /** Telegram bot token */
  telegramBotToken: env.TELEGRAM_BOT_TOKEN,
  /** Telegram chat ID */
  telegramChatId: env.TELEGRAM_CHAT_ID,
  /** Event slug monitored by the order monitor */
  monitorEventSlug: env.MONITOR_EVENT_SLUG,
  /** Poll interval for the order monitor */
  monitorIntervalMs: env.MONITOR_INTERVAL_MS,
  /** Minimum price movement in cents before notifying */
  monitorPriceChangeCents: env.MONITOR_PRICE_CHANGE_CENTS,
};