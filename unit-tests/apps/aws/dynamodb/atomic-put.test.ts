import path from 'node:path';
import {
  createJavascriptContext,
  createJavascriptStateContext,
  runResource,
} from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../../resources/apps/aws/dynamodb/atomic-put.js');

describe('apps/aws/dynamodb/atomic-put', () => {
  it('builds a conditional PutItem request and records the next version on success', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        currentVersion: '7',
        key: 'alpha',
        value: '{"enabled":true}',
      }),
      data: {
        tableName: 'kv_store',
        keyField: 'k',
        keyFieldType: 'S',
        valueType: 'S',
      },
      sendToStep(call) {
        if (call.stepName === 'table-check') {
          return createJavascriptStateContext({
            properties: {
              status: 'ready',
            },
          });
        }
        if (call.stepName === 'dynamodb-request') {
          return createJavascriptStateContext({
            properties: {
              status: '200',
            },
          });
        }
      },
    });

    await runResource({ resource, context });

    expect(context.__sendToStepCalls).toEqual([
      {
        stepName: 'table-check',
        body: null,
        headers: undefined,
      },
      {
        stepName: 'dynamodb-request',
        deploymentAccessId: 'aws-services',
        body: JSON.stringify({
          operationName: 'PutItem',
          body: {
            TableName: 'kv_store',
            Item: {
              v: {
                S: '{"enabled":true}',
              },
              version: {
                N: '8',
              },
              k: {
                S: 'alpha',
              },
            },
            ConditionExpression: 'version = :expected',
            ExpressionAttributeValues: {
              ':expected': {
                N: '7',
              },
            },
          },
        }),
        headers: undefined,
      },
    ]);
    expect(context.getProperty('status')).toBe('200');
    expect(context.getProperty('version')).toBe(8);
  });
});
