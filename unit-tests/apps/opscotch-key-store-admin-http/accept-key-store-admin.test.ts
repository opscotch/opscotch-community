import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../resources/apps/opscotch-key-store-admin-http/accept-key-store-admin.js');
const suite = createResourceSuite({ resources: [{ id: 'resource', resource }] });

describe('key-store-admin-http/accept-key-store-admin', () => {
  it('routes only load requests to the core load operation', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        load: {
          keyId: 'service/example',
          purpose: 'sign',
          keyPair: { publicKeyHex: '0011', secretKeyHex: 'aabb' },
        },
      }),
      sendToStep(call) {
        expect(call.deploymentAccessId).toBe('key-store-admin-call');
        expect(call.stepName).toBe('key-store-operation');
        expect(JSON.parse(call.body || '{}')).toEqual({
          operation: 'load',
          keyId: 'service/example',
          purpose: 'sign',
          keyPair: { publicKeyHex: '0011', secretKeyHex: 'aabb' },
        });
        return { body: JSON.stringify({ loaded: true }), isErrored() { return false; } };
      },
    });

    await suite.run('resource', { context });
    expect(JSON.parse(context.getBody() || '{}')).toEqual({ loaded: true });
  });
});
