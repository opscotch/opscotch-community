import path from 'node:path';
import { createJavascriptContext, createJavascriptStateContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../resources/apps/ospcotch-key-store-dynamodb/table-check.js');
const suite = createResourceSuite({ resources: [{ id: 'resource', resource }] });

describe('key-store-dynamodb/table-check', () => {
  it('checks the configured table through aws-services', async () => {
    const context = createJavascriptContext({
      data: { tableName: 'OpscotchKeyStore', awsServicesId: 'aws-services' },
      sendToStep(call) {
        expect(call.deploymentAccessId).toBe('aws-services');
        expect(call.stepName).toBe('dynamodb-request');
        expect(JSON.parse(call.body || '{}')).toEqual({
          operationName: 'DescribeTable',
          body: { TableName: 'OpscotchKeyStore' },
        });
        return createJavascriptStateContext({
          body: JSON.stringify({ Table: { TableStatus: 'ACTIVE' } }),
          properties: { status_code: '200' },
        });
      },
    });

    await suite.run('resource', { context });

    expect(context.getProperty('status')).toBe('ready');
  });

  it('rejects a table that is not active', async () => {
    const context = createJavascriptContext({
      data: { tableName: 'OpscotchKeyStore', awsServicesId: 'aws-services' },
      sendToStep() {
        return createJavascriptStateContext({
          body: JSON.stringify({ Table: { TableStatus: 'CREATING' } }),
          properties: { status_code: '200' },
        });
      },
    });

    await expect(suite.run('resource', { context })).rejects.toThrow('storage provider unavailable');
  });

  it('creates a missing table and waits for ACTIVE', async () => {
    const calls: Array<Record<string, unknown>> = [];
    let describeCount = 0;
    const context = createJavascriptContext({
      data: {
        tableName: 'OpscotchKeyStore',
        awsServicesId: 'aws-services',
        tableSchema: {
          AttributeDefinitions: [{ AttributeName: 'recordId', AttributeType: 'S' }],
          KeySchema: [{ AttributeName: 'recordId', KeyType: 'HASH' }],
          BillingMode: 'PAY_PER_REQUEST',
        },
      },
      sendToStep(call) {
        calls.push(JSON.parse(call.body || '{}'));
        if (call.stepName !== 'dynamodb-request') return undefined;
        if (calls.at(-1)?.operationName === 'DescribeTable') {
          describeCount += 1;
          if (describeCount === 1) {
            return createJavascriptStateContext({
              body: JSON.stringify({ __type: 'com.amazonaws.dynamodb.v20120810#ResourceNotFoundException' }),
              properties: { status_code: '400' },
            });
          }
          return createJavascriptStateContext({
            body: JSON.stringify({ Table: { TableStatus: 'ACTIVE' } }),
            properties: { status_code: '200' },
          });
        }
        return createJavascriptStateContext({ properties: { status_code: '200' } });
      },
    });

    await suite.run('resource', { context });

    expect(context.getProperty('status')).toBe('ready');
    expect(calls.map((call) => call.operationName)).toEqual([
      'DescribeTable', 'CreateTable', 'DescribeTable',
    ]);
    expect(calls[1]).toMatchObject({
      operationName: 'CreateTable',
      body: {
        TableName: 'OpscotchKeyStore',
        BillingMode: 'PAY_PER_REQUEST',
      },
    });
  });
});
