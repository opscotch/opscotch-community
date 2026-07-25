import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../resources/apps/ospcotch-key-store/accept-key-store.js');
const suite = createResourceSuite({ resources: [{ id: 'resource', resource }] });

const successfulResponse = (body: unknown) => ({
  body: JSON.stringify(body),
  isErrored() { return false; },
  getAllErrors() { return []; },
});

describe('key-store/accept-key-store', () => {
  it.each([
    ['get', { get: { keyId: 'service/example', purpose: 'sign' } }, { keyId: 'service/example', purpose: 'sign' }],
    ['getOrGenerate', { getOrGenerate: { keyId: 'service/example', purpose: 'sign' } }, { keyId: 'service/example', purpose: 'sign' }],
  ])('routes %s requests to the shared operation step', async (operation, request, input) => {
    const context = createJavascriptContext({
      body: JSON.stringify(request),
      sendToStep(call) {
        expect(call.stepName).toBe('key-store-operation');
        expect(JSON.parse(call.body || '{}')).toEqual({ operation, ...input });
        return successfulResponse({ ok: true });
      },
    });

    await suite.run('resource', { context });
    expect(JSON.parse(context.getBody() || '{}')).toEqual({ ok: true });
  });

  it('propagates an operation failure', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({ get: { keyId: 'service/example', purpose: 'sign' } }),
      sendToStep() { return { systemErrors: ['key-store operation failed'] }; },
    });

    await expect(suite.run('resource', { context })).rejects.toThrow('key-store operation failed');
  });

  it('does not expose administrative load through the normal seam', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        load: {
          keyId: 'service/example',
          purpose: 'sign',
          keyPair: { publicKeyHex: '0011', secretKeyHex: 'aabb' },
        },
      }),
      sendToStep() { throw new Error('load must not be routed'); },
    });

    await expect(suite.run('resource', { context })).rejects.toThrow();
  });
});
