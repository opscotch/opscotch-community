import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../resources/apps/key-gen/generate-key-pair.js');

const suite = createResourceSuite({
  resources: [{ id: 'resource', resource }],
});

describe('apps/key-gen/generate-key-pair', () => {
  it('returns a sign key pair as hex', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({ purpose: 'sign' }),
      crypto: {
        generateKeyPair: (purpose: string) => {
          expect(purpose).toBe('sign');
          return [
            context.bytes().createFromByteArray([0xaa, 0xbb]),
            context.bytes().createFromByteArray([0xcc, 0xdd]),
          ];
        },
      },
    });

    await suite.run('resource', { context });

    expect(JSON.parse(context.getBody() || '{}')).toEqual({
      ok: true,
      purpose: 'sign',
      encoding: 'hex',
      keyPair: {
        publicKeyHex: 'aabb',
        secretKeyHex: 'ccdd',
      },
    });
    expect(context.getProperty('status_code')).toBe('200');
    expect(context.getHeader('content-type')).toBe('application/json');
  });

  it('returns a box key pair from an HTTP query event', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({ query: '?purpose=box' }),
      crypto: {
        generateKeyPair: () => [
          context.bytes().createFromByteArray([0x01]),
          context.bytes().createFromByteArray([0x02]),
        ],
      },
    });

    await suite.run('resource', { context });

    expect(JSON.parse(context.getBody() || '{}')).toEqual({
      ok: true,
      purpose: 'box',
      encoding: 'hex',
      keyPair: {
        publicKeyHex: '01',
        secretKeyHex: '02',
      },
    });
  });

  it('returns a stable secretbox shape with null public key', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({ purpose: 'secretbox' }),
      crypto: {
        generateKeyPair: () => [
          null,
          context.bytes().createFromByteArray([0x10, 0x20]),
        ],
      },
    });

    await suite.run('resource', { context });

    expect(JSON.parse(context.getBody() || '{}')).toEqual({
      ok: true,
      purpose: 'secretbox',
      encoding: 'hex',
      keyPair: {
        publicKeyHex: null,
        secretKeyHex: '1020',
      },
    });
  });

  it('returns a structured error when purpose is missing', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({}),
      crypto: {
        generateKeyPair: () => {
          throw new Error('should not be called');
        },
      },
    });

    await suite.run('resource', { context });

    expect(JSON.parse(context.getBody() || '{}')).toEqual({
      ok: false,
      error: {
        code: 'missing_purpose',
        message: 'purpose is required',
        allowedPurposes: ['sign', 'box', 'secretbox'],
      },
    });
    expect(context.getProperty('status_code')).toBe('400');
  });

  it('returns a structured error when purpose is invalid', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({ purpose: 'encrypt' }),
      crypto: {
        generateKeyPair: () => {
          throw new Error('should not be called');
        },
      },
    });

    await suite.run('resource', { context });

    expect(JSON.parse(context.getBody() || '{}')).toEqual({
      ok: false,
      error: {
        code: 'invalid_purpose',
        message: 'purpose must be one of sign, box, secretbox',
        allowedPurposes: ['sign', 'box', 'secretbox'],
      },
    });
    expect(context.getProperty('status_code')).toBe('400');
  });
});
