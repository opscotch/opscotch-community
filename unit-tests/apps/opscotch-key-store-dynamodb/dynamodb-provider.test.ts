import path from 'node:path';
import { createJavascriptContext, createJavascriptStateContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../resources/apps/ospcotch-key-store-dynamodb/dynamodb-provider.js');
const suite = createResourceSuite({ resources: [{ id: 'resource', resource }] });
const data = { tableName: 'OpscotchKeyStore', awsServicesId: 'aws-services', keyField: 'recordId' };
const publicRecord = { format: 'opscotch-key-store/key-record/v2', recordType: 'public', keyId: 'service/example', purpose: 'sign', pairId: 'pair', version: 1 };
const secretRecord = { format: 'opscotch-key-store/key-record/v2', recordType: 'secret', keyId: 'service/example', purpose: 'sign', pairId: 'pair', version: 1 };
const getRequest = { operation: 'getPair', pairId: 'pair', publicRecordId: 'public', secretRecordId: 'secret', includeSecret: true };
const ready = () => createJavascriptStateContext({ properties: { status: 'ready' } });

describe('key-store-dynamodb/dynamodb-provider', () => {
  it('reads public and secret records with consistent GetItem calls', async () => {
    let count = 0;
    const context = createJavascriptContext({
      body: JSON.stringify(getRequest), data,
      sendToStep(call) {
        if (call.stepName === 'table-check') return ready();
        const request = JSON.parse(call.body || '{}');
        expect(request.operationName).toBe('GetItem');
        count += 1;
        const id = count === 1 ? 'public' : 'secret';
        return createJavascriptStateContext({
          body: JSON.stringify({ Item: { recordId: { S: id }, pairId: { S: 'pair' }, recordType: { S: id }, record: { S: JSON.stringify(id === 'public' ? publicRecord : secretRecord) } } }),
          properties: { status_code: '200' },
        });
      },
    });
    await suite.run('resource', { context });
    expect(JSON.parse(context.getBody() || '{}')).toEqual({ status: 'ok', recordVersion: 1, publicRecord, secretRecord });
  });

  it('uses one conditional DynamoDB transaction for pair creation', async () => {
    const request = { operation: 'putPairIfAbsent', pairId: 'pair', publicRecordId: 'public', secretRecordId: 'secret', publicRecord, secretRecord };
    let dynamoRequest: any;
    const context = createJavascriptContext({
      body: JSON.stringify(request), data,
      sendToStep(call) {
        if (call.stepName === 'table-check') return ready();
        dynamoRequest = JSON.parse(call.body || '{}');
        return createJavascriptStateContext({ properties: { status_code: '200' } });
      },
    });
    await suite.run('resource', { context });
    expect(JSON.parse(context.getBody() || '{}')).toEqual({ status: 'created', recordVersion: 1 });
    expect(dynamoRequest.operationName).toBe('TransactWriteItems');
    expect(dynamoRequest.body.TransactItems).toHaveLength(2);
    expect(dynamoRequest.body.TransactItems[0].Put.ConditionExpression).toBe('attribute_not_exists(recordId)');
  });

  it('maps transaction cancellation to a pair conflict', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({ operation: 'putPairIfAbsent', pairId: 'pair', publicRecordId: 'public', secretRecordId: 'secret', publicRecord, secretRecord }), data,
      sendToStep(call) {
        if (call.stepName === 'table-check') return ready();
        return createJavascriptStateContext({
          body: JSON.stringify({ __type: 'com.amazonaws.dynamodb.v20120810#TransactionCanceledException' }),
          properties: { status_code: '400' },
        });
      },
    });
    await suite.run('resource', { context });
    expect(JSON.parse(context.getBody() || '{}')).toEqual({ status: 'conflict', error: 'pair already exists' });
  });
});
