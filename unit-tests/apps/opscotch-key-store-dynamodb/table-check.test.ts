import path from 'node:path';
import { createJavascriptContext, createJavascriptStateContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../resources/apps/ospcotch-key-store-dynamodb/dynamodb-provider.js');
const suite = createResourceSuite({ resources: [{ id: 'resource', resource }] });

describe('key-store-dynamodb/table-check', () => {
  it('passes through a getPair request after the table check succeeds', async () => {
    const context = createJavascriptContext({
      data: { tableName: 'OpscotchKeyStore', awsServicesId: 'aws-services', keyField: 'recordId' },
      body: JSON.stringify({
        operation: 'getPair',
        pairId: 'pair',
        publicRecordId: 'public',
        secretRecordId: 'secret',
        includeSecret: false,
      }),
      sendToStep(call) {
        if (call.stepName === 'table-check') {
          return createJavascriptStateContext({
            properties: { status: 'ready' },
          });
        }
        expect(call.stepName).toBe('dynamodb-request');
        expect(JSON.parse(call.body || '{}')).toEqual({
          operationName: 'GetItem',
          body: {
            TableName: 'OpscotchKeyStore',
            Key: { recordId: { S: 'public' } },
            ConsistentRead: true,
          },
        });
        return createJavascriptStateContext({
          body: JSON.stringify({
            Item: {
              recordId: { S: 'public' },
              pairId: { S: 'pair' },
              recordType: { S: 'public' },
              record: { S: JSON.stringify({ hello: 'world' }) },
            },
          }),
          properties: { status_code: '200' },
        });
      },
    });

    await suite.run('resource', { context });

    expect(JSON.parse(context.getBody() || '{}')).toEqual({
      status: 'ok',
      recordVersion: 1,
      publicRecord: { hello: 'world' },
    });
  });

  it('rejects a table that is not active', async () => {
    const context = createJavascriptContext({
      data: { tableName: 'OpscotchKeyStore', awsServicesId: 'aws-services', keyField: 'recordId' },
      sendToStep() {
        return createJavascriptStateContext({
          body: JSON.stringify({ Table: { TableStatus: 'CREATING' } }),
          properties: { status_code: '200', status: 'creating' },
        });
      },
    });

    await expect(suite.run('resource', { context })).rejects.toThrow('storage provider unavailable');
  });
});
