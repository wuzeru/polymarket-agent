import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { config } from '../src/config.js';
import { buildClobAuthTypedData, formatClobCredentialsEnv } from '../src/monitor/clob-browser-auth.js';
import type { ClobCredentials } from '../src/monitor/clob-browser-auth.js';

const host = '127.0.0.1';
const port = Number.parseInt(process.env.CLOB_DERIVE_PORT ?? '8765', 10);

interface DeriveRequest {
  address: string;
  timestamp: string;
  nonce: number;
  signature: string;
}

async function main(): Promise<void> {
  const server = createServer((req, res) => {
    handleRequest(req, res).catch(error => {
      const message = error instanceof Error ? error.message : String(error);
      sendJson(res, 500, { error: message });
    });
  });

  server.listen(port, host, () => {
    const url = `http://${host}:${port}`;
    process.stdout.write(`CLOB key derive tool is running: ${url}\n`);
    process.stdout.write('Open this URL in the browser where Rabby is installed.\n');
  });
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${host}:${port}`);

  if (req.method === 'GET' && url.pathname === '/') {
    sendHtml(res, renderPage());
    return;
  }

  if (req.method === 'GET' && url.pathname === '/typed-data') {
    const address = url.searchParams.get('address');
    if (!address) {
      sendJson(res, 400, { error: 'Missing address' });
      return;
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = Number.parseInt(url.searchParams.get('nonce') ?? '0', 10);
    sendJson(res, 200, {
      timestamp,
      nonce,
      typedData: buildClobAuthTypedData(address, timestamp, nonce),
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/derive') {
    const body = await readJsonBody<DeriveRequest>(req);
    validateDeriveRequest(body);
    const credentials = await deriveOrCreateCredentials(body);
    sendJson(res, 200, {
      credentials,
      env: formatClobCredentialsEnv(credentials),
      note: 'Copy these values into .env. Do not share secret/passphrase in chat.',
    });
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
}

async function deriveOrCreateCredentials(request: DeriveRequest): Promise<ClobCredentials> {
  const derived = await callClobAuth('GET', '/auth/derive-api-key', request);
  if (isCredentials(derived)) return normalizeCredentials(derived);

  const created = await callClobAuth('POST', '/auth/api-key', request);
  if (isCredentials(created)) return normalizeCredentials(created);

  throw new Error(`Unexpected CLOB auth response: ${JSON.stringify(created)}`);
}

async function callClobAuth(method: 'GET' | 'POST', path: string, request: DeriveRequest): Promise<unknown> {
  const response = await fetch(`${config.clobRestUrl}${path}`, {
    method,
    headers: {
      'Accept-Encoding': 'identity',
      POLY_ADDRESS: request.address,
      POLY_SIGNATURE: request.signature,
      POLY_TIMESTAMP: request.timestamp,
      POLY_NONCE: String(request.nonce),
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) as unknown : null;

  if (!response.ok && response.status !== 404) {
    throw new Error(`CLOB ${path} failed: ${response.status} ${text}`);
  }

  return data;
}

function isCredentials(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    (typeof record.key === 'string' || typeof record.apiKey === 'string') &&
    typeof record.secret === 'string' &&
    typeof record.passphrase === 'string'
  );
}

function normalizeCredentials(value: unknown): ClobCredentials {
  const record = value as Record<string, string>;
  return {
    key: record.key ?? record.apiKey,
    secret: record.secret,
    passphrase: record.passphrase,
  };
}

function validateDeriveRequest(body: DeriveRequest): void {
  if (!/^0x[a-fA-F0-9]{40}$/.test(body.address)) {
    throw new Error('Invalid wallet address');
  }
  if (!body.signature?.startsWith('0x')) {
    throw new Error('Invalid signature');
  }
  if (!body.timestamp || !Number.isFinite(Number.parseInt(body.timestamp, 10))) {
    throw new Error('Invalid timestamp');
  }
  if (!Number.isInteger(body.nonce)) {
    throw new Error('Invalid nonce');
  }
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body, null, 2));
}

function sendHtml(res: ServerResponse, html: string): void {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(html);
}

function renderPage(): string {
  return String.raw`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Polymarket CLOB Key Derive</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; background: #0f172a; color: #e5eefc; }
    main { max-width: 820px; margin: 48px auto; padding: 0 24px; }
    .card { background: #172033; border: 1px solid #2b3955; border-radius: 18px; padding: 22px; margin: 18px 0; box-shadow: 0 20px 50px rgba(0,0,0,.28); }
    h1 { margin: 0 0 8px; font-size: 30px; letter-spacing: -0.03em; }
    p { color: #aebbd2; line-height: 1.7; }
    button { appearance: none; border: 0; border-radius: 12px; padding: 12px 16px; background: #3b82f6; color: white; font-weight: 700; cursor: pointer; margin-right: 8px; }
    button.secondary { background: #26344f; }
    button:disabled { opacity: .55; cursor: not-allowed; }
    code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    pre { white-space: pre-wrap; word-break: break-word; background: #0b1120; border: 1px solid #2b3955; border-radius: 14px; padding: 14px; color: #dbeafe; }
    .ok { color: #34d399; }
    .warn { color: #fbbf24; }
    .err { color: #f87171; }
    .row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  </style>
</head>
<body>
  <main>
    <h1>Polymarket CLOB Key Derive</h1>
    <p>这个页面只在本机运行。它会让 Rabby 对 CLOB auth message 签名，然后本地服务向 Polymarket CLOB API 派生或创建 <code>apiKey / secret / passphrase</code>。</p>
    <div class="card">
      <h2>1. 连接 Rabby</h2>
      <div class="row">
        <button id="connect">Connect Rabby</button>
        <span id="account">未连接</span>
      </div>
      <p class="warn">确认连接地址是 Polymarket 开发者页中的 signer 地址，例如 <code>0xd743...6ed7</code>。</p>
    </div>

    <div class="card">
      <h2>2. 签名并生成 CLOB credentials</h2>
      <button id="derive" disabled>Sign & Derive CLOB Key</button>
      <p>Rabby 会弹出签名确认。请确认签名内容是 <code>This message attests that I control the given wallet</code>，且链 ID 为 Polygon 137。</p>
    </div>

    <div class="card">
      <h2>结果</h2>
      <pre id="result">等待操作...</pre>
      <button id="copy" class="secondary" disabled>Copy .env lines</button>
    </div>
  </main>

  <script>
    const connectButton = document.getElementById('connect');
    const deriveButton = document.getElementById('derive');
    const copyButton = document.getElementById('copy');
    const accountEl = document.getElementById('account');
    const resultEl = document.getElementById('result');
    let account = null;
    let envText = '';

    function setResult(text, className = '') {
      resultEl.className = className;
      resultEl.textContent = text;
    }

    connectButton.onclick = async () => {
      try {
        if (!window.ethereum) throw new Error('没有检测到 Rabby/以太坊钱包插件');
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        account = accounts[0];
        accountEl.textContent = account;
        accountEl.className = 'ok';
        deriveButton.disabled = false;
      } catch (error) {
        setResult(error.message || String(error), 'err');
      }
    };

    deriveButton.onclick = async () => {
      try {
        if (!account) throw new Error('请先连接 Rabby');
        deriveButton.disabled = true;
        setResult('正在切换 Rabby 到 Polygon...');
        await ensurePolygon();

        setResult('正在构造 typed data...');

        const typedResp = await fetch('/typed-data?address=' + encodeURIComponent(account) + '&nonce=0');
        const typedPayload = await typedResp.json();
        if (!typedResp.ok) throw new Error(typedPayload.error || 'typed-data request failed');

        setResult('请在 Rabby 中确认签名...');
        const signature = await window.ethereum.request({
          method: 'eth_signTypedData_v4',
          params: [account, JSON.stringify(typedPayload.typedData)],
        });

        setResult('签名完成，正在向 CLOB 派生/创建 credentials...');
        const deriveResp = await fetch('/derive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address: account,
            timestamp: typedPayload.timestamp,
            nonce: typedPayload.nonce,
            signature,
          }),
        });
        const derivePayload = await deriveResp.json();
        if (!deriveResp.ok) throw new Error(derivePayload.error || 'derive request failed');

        envText = derivePayload.env;
        setResult(derivePayload.env + '\\n\\n复制到项目 .env 后运行：npm run monitor:orders -- --once', 'ok');
        copyButton.disabled = false;
      } catch (error) {
        setResult(error.message || String(error), 'err');
      } finally {
        deriveButton.disabled = !account;
      }
    };

    copyButton.onclick = async () => {
      await navigator.clipboard.writeText(envText);
      copyButton.textContent = 'Copied';
      setTimeout(() => { copyButton.textContent = 'Copy .env lines'; }, 1200);
    };

    async function ensurePolygon() {
      const polygonChainId = '0x89';
      const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
      if (currentChainId === polygonChainId) return;

      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: polygonChainId }],
        });
      } catch (error) {
        if (error.code !== 4902) throw error;
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: polygonChainId,
            chainName: 'Polygon',
            nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
            rpcUrls: ['https://polygon-rpc.com'],
            blockExplorerUrls: ['https://polygonscan.com'],
          }],
        });
      }
    }
  </script>
</body>
</html>`;
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`CLOB derive tool error: ${message}`);
  process.exit(1);
});
