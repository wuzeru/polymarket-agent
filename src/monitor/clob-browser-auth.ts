export interface ClobAuthTypedData {
  domain: {
    name: 'ClobAuthDomain';
    version: '1';
    chainId: 137;
  };
  primaryType: 'ClobAuth';
  types: {
    EIP712Domain: Array<{ name: string; type: string }>;
    ClobAuth: Array<{ name: string; type: string }>;
  };
  message: {
    address: string;
    timestamp: string;
    nonce: number;
    message: 'This message attests that I control the given wallet';
  };
}

export interface ClobCredentials {
  key: string;
  secret: string;
  passphrase: string;
}

const CLOB_AUTH_MESSAGE = 'This message attests that I control the given wallet';

export function buildClobAuthTypedData(address: string, timestamp: string, nonce: number): ClobAuthTypedData {
  return {
    domain: {
      name: 'ClobAuthDomain',
      version: '1',
      chainId: 137,
    },
    primaryType: 'ClobAuth',
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
      ],
      ClobAuth: [
        { name: 'address', type: 'address' },
        { name: 'timestamp', type: 'string' },
        { name: 'nonce', type: 'uint256' },
        { name: 'message', type: 'string' },
      ],
    },
    message: {
      address: address.toLowerCase(),
      timestamp,
      nonce,
      message: CLOB_AUTH_MESSAGE,
    },
  };
}

export function formatClobCredentialsEnv(credentials: ClobCredentials): string {
  return [
    `POLYMARKET_CLOB_API_KEY=${credentials.key}`,
    `POLYMARKET_CLOB_SECRET=${credentials.secret}`,
    `POLYMARKET_CLOB_PASSPHRASE=${credentials.passphrase}`,
  ].join('\n');
}
