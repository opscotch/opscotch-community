import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../resources/apps/ospcotch-key-store/accept-key-store-http.js');
const suite = createResourceSuite({ resources: [{ id: 'resource', resource }] });

const successfulResponse = (body: unknown) => ({
  body: JSON.stringify(body),
  isErrored() { return false; },
  getAllErrors() { return []; },
});

describe('key-store-http/accept-key-store-http', () => {
  it('unwraps the HTTP request and forwards the key-store body', async () => {
    const requestBody = JSON.stringify({
      getOrGenerate: { keyId: 'service/example', purpose: 'sign' },
    });
    const context = createJavascriptContext({
      body: JSON.stringify({
        method: 'POST',
        path: '/key-store',
        headers: { 'content-type': 'application/json' },
        body: requestBody,
      }),
      sendToStep(call) {
        expect(call.deploymentAccessId).toBe('key-store-call');
        expect(call.stepName).toBe('key-store-operation');
        expect(JSON.parse(call.body || '{}')).toEqual({
          operation: 'getOrGenerate', keyId: 'service/example', purpose: 'sign',
        });
        return successfulResponse({ keyId: 'service/example', created: true, version: 1 });
      },
    });

    await suite.run('resource', { context });

    expect(JSON.parse(context.getBody() || '{}')).toEqual({
      keyId: 'service/example',
      created: true,
      version: 1,
    });
    expect(context.getHeader('content-type')).toBe('application/json');
  });

  it('maps a missing key to an HTTP 400 response', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({ body: JSON.stringify({ get: { keyId: 'missing', purpose: 'sign' } }) }),
      sendToStep() {
        return { systemErrors: ['key not found'] };
      },
    });

    await suite.run('resource', { context });

    expect(context.getProperty('status_code')).toBe(400);
    expect(JSON.parse(context.getBody() || '{}')).toEqual({ error: 'key not found' });
  });

  it('declares a schema that excludes administrative load requests', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({ body: '{}' }),
    });

    const result = await suite.run('resource', { context });
    const schema = result.doc.inSchemaValue;

    expect(schema.oneOf).toHaveLength(2);
    expect(schema.oneOf.map((branch) => Object.keys(branch.properties))).toEqual([
      ['get'],
      ['getOrGenerate'],
    ]);
    expect(context.__sendToStepCalls).toHaveLength(1);
  });

  it('propagates backend failures instead of classifying them as client errors', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({ body: JSON.stringify({ get: { keyId: 'service/example', purpose: 'sign' } }) }),
      sendToStep() {
        return { systemErrors: ['storage provider unavailable'] };
      },
    });

    await expect(suite.run('resource', { context })).rejects.toThrow(
      'storage provider unavailable',
    );
  });
});
