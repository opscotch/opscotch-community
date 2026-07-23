import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../resources/apps/ospcotch-key-store/local-file-provider.js');
const suite = createResourceSuite({ resources: [{ id: 'resource', resource }] });
const publicRecord = { format: 'opscotch-key-store/key-record/v2', recordType: 'public', keyId: 'service/example', purpose: 'sign', pairId: 'pair', version: 1 };
const secretRecord = { format: 'opscotch-key-store/key-record/v2', recordType: 'secret', keyId: 'service/example', purpose: 'sign', pairId: 'pair', version: 1 };
const pairRequest = { operation: 'putPairIfAbsent', pairId: 'pair', publicRecordId: 'public', secretRecordId: 'secret', publicRecord, secretRecord };

describe('key-store-local-storage/local-file-provider', () => {
  it('returns not-found when the pair file does not exist', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({ operation: 'getPair', pairId: 'pair', publicRecordId: 'public', secretRecordId: 'secret', includeSecret: true }),
      data: { storageProvider: 'local-file' }, files: { read() { throw new Error('file not found'); } },
    });
    await suite.run('resource', { context });
    expect(JSON.parse(context.getBody() || '{}')).toEqual({ status: 'not-found' });
  });

  it('writes both records through one temporary pair file', async () => {
    const writes: Array<{ name: string; body: string }> = [];
    const moves: Array<{ source: string; target: string; overwrite: boolean }> = [];
    const context = createJavascriptContext({
      body: JSON.stringify(pairRequest), data: { storageProvider: 'local-file' },
      files: {
        read() { throw new Error('file not found'); },
        write(name: string, body: string) { writes.push({ name, body }); },
        move(source: string, _directory: string, target: string, _create: boolean, overwrite: boolean) { moves.push({ source, target, overwrite }); },
      },
    });
    await suite.run('resource', { context });
    expect(JSON.parse(context.getBody() || '{}')).toEqual({ status: 'created', recordVersion: 1 });
    expect(JSON.parse(writes[0].body)).toMatchObject({ pairId: 'pair', publicRecord, secretRecord });
    expect(moves[0]).toMatchObject({ source: writes[0].name, overwrite: false });
  });

  it('maps file permission failures to provider unavailable', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({ operation: 'getPair', pairId: 'pair', publicRecordId: 'public', secretRecordId: 'secret', includeSecret: false }),
      data: { storageProvider: 'local-file' }, files: { read() { throw new Error('FC2 permission denied'); } },
    });
    await expect(suite.run('resource', { context })).rejects.toThrow('storage provider unavailable');
  });
});
