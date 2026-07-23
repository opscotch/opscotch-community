import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../resources/apps/ospcotch-key-store/memory-provider.js');
const suite = createResourceSuite({ resources: [{ id: 'resource', resource }] });
const pair = { operation: 'putPairIfAbsent', pairId: 'pair', publicRecordId: 'public', secretRecordId: 'secret', publicRecord: { recordType: 'public' }, secretRecord: { recordType: 'secret' } };
const get = { operation: 'getPair', pairId: 'pair', publicRecordId: 'public', secretRecordId: 'secret', includeSecret: true };

describe('key-store-local-storage/memory-provider', () => {
  it('creates and detects duplicate immutable pairs', async () => {
    const context = createJavascriptContext({ body: JSON.stringify(pair), data: { storageProvider: 'memory' } });
    await suite.run('resource', { context });
    expect(JSON.parse(context.getBody() || '{}')).toEqual({ status: 'created', recordVersion: 1 });
    context.setBody(JSON.stringify(pair));
    await suite.run('resource', { context });
    expect(JSON.parse(context.getBody() || '{}')).toMatchObject({ status: 'conflict', recordVersion: 1 });
    context.setBody(JSON.stringify(get));
    await suite.run('resource', { context });
    expect(JSON.parse(context.getBody() || '{}')).toMatchObject({ status: 'ok', publicRecord: { recordType: 'public' }, secretRecord: { recordType: 'secret' } });
  });

  it('returns not-found for a missing pair', async () => {
    const context = createJavascriptContext({ body: JSON.stringify(get), data: { storageProvider: 'memory' } });
    await suite.run('resource', { context });
    expect(JSON.parse(context.getBody() || '{}')).toEqual({ status: 'not-found' });
  });
});
