import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../resources/apps/ospcotch-key-store/storage-provider.js');
const suite = createResourceSuite({ resources: [{ id: 'resource', resource }] });

const providerResponse = (body: unknown) => ({
  body: JSON.stringify(body),
  isErrored() { return false; },
  getAllErrors() { return []; },
});

describe('key-store-local-storage/storage-provider', () => {
  it.each([
    ['local-file', 'storage-provider-local-file'],
    ['memory', 'storage-provider-memory'],
  ])('routes %s requests to its provider step', async (provider, stepName) => {
    const context = createJavascriptContext({
      body: JSON.stringify({ operation: 'getPair', pairId: 'pair', publicRecordId: 'public', secretRecordId: 'secret', includeSecret: false }),
      data: { storageProvider: provider },
      sendToStep(call) {
        expect(call.stepName).toBe(stepName);
        return providerResponse({ status: 'not-found' });
      },
    });

    await suite.run('resource', { context });

    expect(JSON.parse(context.getBody() || '{}')).toEqual({ status: 'not-found' });
  });

  it('rejects an unsupported provider', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({ operation: 'getPair', pairId: 'pair', publicRecordId: 'public', secretRecordId: 'secret', includeSecret: false }),
      data: { storageProvider: 's3' },
    });

    await expect(suite.run('resource', { context })).rejects.toThrow('unsupported storage provider');
  });

  it('normalizes provider errors', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({ operation: 'getPair', pairId: 'pair', publicRecordId: 'public', secretRecordId: 'secret', includeSecret: false }),
      data: { storageProvider: 'memory' },
      sendToStep() { return { systemErrors: ['provider failed'] }; },
    });

    await expect(suite.run('resource', { context })).rejects.toThrow('storage provider unavailable');
  });
});
