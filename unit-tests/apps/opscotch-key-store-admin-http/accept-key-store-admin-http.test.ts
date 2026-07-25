import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../resources/apps/opscotch-key-store-admin-http/accept-key-store-admin-http.js');
const suite = createResourceSuite({ resources: [{ id: 'resource', resource }] });

describe('key-store-admin-http/accept-key-store-admin-http', () => {
  it('forwards an administrative load request and returns 201 without changing the body', async () => {
    const request = JSON.stringify({
      load: {
        keyId: 'service/example',
        purpose: 'sign',
        keyPair: { publicKeyHex: '0011', secretKeyHex: 'aabb' },
      },
    });
    const context = createJavascriptContext({
      body: JSON.stringify({ body: request }),
      sendToStep(call) {
        expect(call.stepName).toBe('accept-key-store-admin');
        expect(call.body).toBe(request);
        return { body: JSON.stringify({ loaded: true }), isErrored: () => false };
      },
    });

    await suite.run('resource', { context });

    expect(context.getProperty('status_code')).toBe(201);
    expect(JSON.parse(context.getBody() || '{}')).toEqual({ loaded: true });
  });

  it('maps an existing key to 409', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({ body: '{}' }),
      sendToStep() { return { systemErrors: ['key already exists'] }; },
    });

    await suite.run('resource', { context });

    expect(context.getProperty('status_code')).toBe(409);
    expect(JSON.parse(context.getBody() || '{}')).toEqual({ error: 'key already exists' });
  });

  it('maps invalid load requests to 400', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({ body: '{}' }),
      sendToStep() { return { systemErrors: ['No oneOf passed'] }; },
    });

    await suite.run('resource', { context });

    expect(context.getProperty('status_code')).toBe(400);
    expect(JSON.parse(context.getBody() || '{}')).toEqual({
      error: 'invalid key-store load request',
    });
  });
});
