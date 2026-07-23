import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../resources/apps/ospcotch-key-store-dynamodb/accept-storage.js');
const suite = createResourceSuite({ resources: [{ id: 'resource', resource }] });

describe('key-store-dynamodb/accept-storage', () => {
  it('forwards valid requests to the provider and returns its response', async () => {
    const request = { operation: 'getPair', pairId: 'pair', publicRecordId: 'public', secretRecordId: 'secret', includeSecret: false };
    const context = createJavascriptContext({
      body: JSON.stringify(request),
      sendToStep(call) {
        expect(call.stepName).toBe('storage-provider');
        expect(JSON.parse(call.body || '{}')).toEqual(request);
        return { body: JSON.stringify({ status: 'not-found' }) };
      },
    });

    await suite.run('resource', { context });

    expect(JSON.parse(context.getBody() || '{}')).toEqual({ status: 'not-found' });
  });

  it('normalizes provider failures', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({ operation: 'getPair', pairId: 'pair', publicRecordId: 'public', secretRecordId: 'secret', includeSecret: false }),
      sendToStep() { return { systemErrors: ['provider failure'] }; },
    });

    await expect(suite.run('resource', { context })).rejects.toThrow('storage provider unavailable');
  });
});
