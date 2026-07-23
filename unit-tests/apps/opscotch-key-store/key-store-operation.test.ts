import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../resources/apps/ospcotch-key-store/key-store-operation.js');
const suite = createResourceSuite({ resources: [{ id: 'resource', resource }] });

const baseData = (operation: string, secret = true) => ({
  operation,
  publicKeyStoreSeedHex: '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff',
  ...(secret ? { secretKeyStoreSeedHex: 'ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100' } : {}),
  publicKeyStoreDomain: 'public-unit-test',
  secretKeyStoreDomain: 'secret-unit-test',
  derivationVersion: 'v2',
  storageDeploymentAccessId: 'storage-call',
  storageStepId: 'accept-storage',
});

const response = (body: unknown) => ({
  body: JSON.stringify(body),
  isErrored() { return false; },
  getAllErrors() { return []; },
});

const generatedKeyPair = { publicKeyHex: '0011aabb', secretKeyHex: 'ffeeddcc' };

const testCrypto = {
  encryptSymmetric(plaintext: unknown) { return plaintext; },
  decryptSymmetric(ciphertext: unknown) { return ciphertext; },
  hmacSha256(_key: unknown, input: unknown) { return input; },
  registerKey(_purpose: string, _type: string, key: unknown) { return key; },
};

describe('key-store/key-store-operation', () => {
  it('creates an immutable pair through the shared generator and storage seam', async () => {
    let records: { publicRecord: unknown; secretRecord: unknown } | undefined;
    const context = createJavascriptContext({
      body: JSON.stringify({ keyId: 'service/generated', purpose: 'sign' }),
      data: baseData('getOrGenerate'),
      crypto: testCrypto,
      sendToStep(call) {
        if (call.stepName === 'key-store-generate-key-pair') {
          expect(JSON.parse(call.body || '{}')).toEqual({ purpose: 'sign' });
          return response({ ok: true, purpose: 'sign', encoding: 'hex', keyPair: generatedKeyPair });
        }
        const request = JSON.parse(call.body || '{}');
        if (request.operation === 'getPair') {
          return records ? response({ status: 'ok', recordVersion: 1, ...records }) : response({ status: 'not-found' });
        }
        records = { publicRecord: request.publicRecord, secretRecord: request.secretRecord };
        return response({ status: 'created', recordVersion: 1 });
      },
    });

    await suite.run('resource', { context });
    expect(JSON.parse(context.getBody() || '{}')).toMatchObject({
      keyId: 'service/generated', purpose: 'sign', keyPair: generatedKeyPair, created: true, version: 1,
    });
    expect(records?.publicRecord).toMatchObject({ format: 'opscotch-key-store/key-record/v2', recordType: 'public', purpose: 'sign' });
    expect(records?.secretRecord).toMatchObject({ format: 'opscotch-key-store/key-record/v2', recordType: 'secret', purpose: 'sign' });
  });

  it('returns an existing pair and validates its public and secret records', async () => {
    let records: { publicRecord: any; secretRecord: any } | undefined;
    const context = createJavascriptContext({
      body: JSON.stringify({ keyId: 'service/existing', purpose: 'authenticated' }),
      data: baseData('getOrGenerate'),
      crypto: testCrypto,
      sendToStep(call) {
        if (call.stepName === 'key-store-generate-key-pair') {
          return response({ ok: true, purpose: 'authenticated', encoding: 'hex', keyPair: generatedKeyPair });
        }
        const request = JSON.parse(call.body || '{}');
        if (request.operation === 'getPair') {
          return records ? response({ status: 'ok', recordVersion: 1, ...records }) : response({ status: 'not-found' });
        }
        records = { publicRecord: request.publicRecord, secretRecord: request.secretRecord };
        return response({ status: 'created', recordVersion: 1 });
      },
    });
    await suite.run('resource', { context });
    await suite.run('resource', { context });
    expect(JSON.parse(context.getBody() || '{}')).toMatchObject({
      keyId: 'service/existing', purpose: 'authenticated', keyPair: generatedKeyPair, created: false,
    });
  });

  it('returns only the public key without a secret seed', async () => {
    let publicRecord: any;
    let secretRecord: any;
    const privateContext = createJavascriptContext({
      body: JSON.stringify({ keyId: 'service/public', purpose: 'sign' }),
      data: baseData('getOrGenerate'),
      crypto: testCrypto,
      sendToStep(call) {
        if (call.stepName === 'key-store-generate-key-pair') {
          return response({ ok: true, purpose: 'sign', encoding: 'hex', keyPair: generatedKeyPair });
        }
        const request = JSON.parse(call.body || '{}');
        if (request.operation === 'getPair') {
          return publicRecord ? response({
            status: 'ok', publicRecord, recordVersion: 1,
            ...(request.includeSecret ? { secretRecord } : {}),
          }) : response({ status: 'not-found' });
        }
        publicRecord = request.publicRecord;
        secretRecord = request.secretRecord;
        return response({ status: 'created', recordVersion: 1 });
      },
    });
    await suite.run('resource', { context: privateContext });
    privateContext.setData(JSON.stringify({ ...baseData('get', false), secretKeyStoreSeedHex: '' }));
    await suite.run('resource', { context: privateContext });
    const result = JSON.parse(privateContext.getBody() || '{}');
    expect(result.keyPair).toEqual({ publicKeyHex: '0011aabb' });
    expect(result.keyPair.secretKeyHex).toBeUndefined();
  });

  it('rejects a tampered public record', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({ keyId: 'service/tampered', purpose: 'sign' }),
      data: baseData('get'),
      crypto: testCrypto,
      sendToStep() {
        return response({
          status: 'ok', recordVersion: 1,
          publicRecord: {
            format: 'opscotch-key-store/key-record/v2', recordType: 'public', keyId: 'service/tampered',
            purpose: 'sign', pairId: 'wrong', derivation: 'v2', domain: 'public-unit-test',
            payload: { publicKeyHex: '0011' }, tag: 'tampered', version: 1,
          },
        });
      },
    });
    await expect(suite.run('resource', { context })).rejects.toThrow('key record integrity failure');
  });

  it('loads an existing pair without returning secret material', async () => {
    let records: { publicRecord: unknown; secretRecord: unknown } | undefined;
    const context = createJavascriptContext({
      body: JSON.stringify({
        keyId: 'service/imported',
        purpose: 'sign',
        keyPair: generatedKeyPair,
      }),
      data: baseData('load'),
      crypto: testCrypto,
      sendToStep(call) {
        const request = JSON.parse(call.body || '{}');
        if (request.operation === 'getPair') {
          return records
            ? response({ status: 'ok', recordVersion: 1, ...records })
            : response({ status: 'not-found' });
        }
        records = { publicRecord: request.publicRecord, secretRecord: request.secretRecord };
        return response({ status: 'created', recordVersion: 1 });
      },
    });

    await suite.run('resource', { context });
    const result = JSON.parse(context.getBody() || '{}');
    expect(result).toMatchObject({ keyId: 'service/imported', purpose: 'sign', loaded: true, version: 1 });
    expect(result.keyPair).toBeUndefined();
    expect(records?.publicRecord).toMatchObject({ recordType: 'public', purpose: 'sign' });
    expect(records?.secretRecord).toMatchObject({ recordType: 'secret', purpose: 'sign' });

    context.setBody(JSON.stringify({
      keyId: 'service/imported',
      purpose: 'sign',
      keyPair: generatedKeyPair,
    }));
    await suite.run('resource', { context });
    expect(JSON.parse(context.getBody() || '{}')).toMatchObject({
      keyId: 'service/imported', purpose: 'sign', loaded: true, existing: true, version: 1,
    });

    context.setBody(JSON.stringify({
      keyId: 'service/imported',
      purpose: 'sign',
      keyPair: { publicKeyHex: '0011aabb', secretKeyHex: 'different' },
    }));
    await expect(suite.run('resource', { context })).rejects.toThrow('key already exists');
  });
});
