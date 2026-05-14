import { describe, expect, it } from 'vitest';
import { buildClobAuthTypedData, formatClobCredentialsEnv } from './clob-browser-auth.js';

describe('buildClobAuthTypedData', () => {
  it('builds the CLOB EIP-712 auth payload expected by Rabby', () => {
    const typedData = buildClobAuthTypedData('0xd743ae9c41f3767bb3c01fab40b0aad1418e6ed7', '1778745600', 0);

    expect(typedData).toEqual({
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
        address: '0xd743ae9c41f3767bb3c01fab40b0aad1418e6ed7',
        timestamp: '1778745600',
        nonce: 0,
        message: 'This message attests that I control the given wallet',
      },
    });
  });
});

describe('formatClobCredentialsEnv', () => {
  it('formats credentials as .env lines', () => {
    const env = formatClobCredentialsEnv({
      key: 'key',
      secret: 'secret',
      passphrase: 'passphrase',
    });

    expect(env).toBe([
      'POLYMARKET_CLOB_API_KEY=key',
      'POLYMARKET_CLOB_SECRET=secret',
      'POLYMARKET_CLOB_PASSPHRASE=passphrase',
    ].join('\n'));
  });
});
