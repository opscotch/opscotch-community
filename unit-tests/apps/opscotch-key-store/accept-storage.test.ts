import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../resources/apps/ospcotch-key-store/accept-storage.js');
const suite = createResourceSuite({ resources: [{ id: 'resource', resource }] });

const response = (body: unknown) => ({
  body: JSON.stringify(body),
  isErrored() { return false; },
  getAllErrors() { return []; },
});

describe('key-store-local-storage/accept-storage', () => {
  it('forwards a valid storage request and returns the provider response', async () => {
    const request = { operation: 'getPair', pairId: 'pair', publicRecordId: 'public', secretRecordId: 'secret', includeSecret: false };
    const context = createJavascriptContext({
      body: JSON.stringify(request),
      sendToStep(call) {
        expect(call.stepName).toBe('storage-provider');
        expect(JSON.parse(call.body || '{}')).toEqual(request);
        return response({ status: 'not-found' });
      },
    });

    await suite.run('resource', { context });

    expect(JSON.parse(context.getBody() || '{}')).toEqual({ status: 'not-found' });
  });

  it('turns a provider error into a storage-unavailable failure', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({ operation: 'getPair', pairId: 'pair', publicRecordId: 'public', secretRecordId: 'secret', includeSecret: false }),
      sendToStep() { return { systemErrors: ['provider failed'] }; },
    });

    await expect(suite.run('resource', { context })).rejects.toThrow('storage provider unavailable');
  });
});
