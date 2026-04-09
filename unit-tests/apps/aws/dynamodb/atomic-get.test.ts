import path from 'node:path';
import {
  createJavascriptContext,
  createJavascriptStateContext,
  runResource,
} from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../../resources/apps/aws/dynamodb/atomic-get.js');

describe('apps/aws/dynamodb/atomic-get', () => {
  it('fetches keys from DynamoDB and normalizes the response map', async () => {
    const context = createJavascriptContext({
      body: '["alpha","beta"]',
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
            body: JSON.stringify({
              Responses: {
                kv_store: [
                  { k: { S: 'alpha' }, v: { S: 'one' }, version: { N: '3' } },
                  { k: { S: 'beta' }, v: { S: 'two' }, version: { N: '4' } },
                ],
              },
            }),
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
          operationName: 'BatchGetItem',
          body: {
            RequestItems: {
              kv_store: {
                Keys: [
                  { k: { S: 'alpha' } },
                  { k: { S: 'beta' } },
                ],
                ConsistentRead: true,
              },
            },
          },
        }),
        headers: undefined,
      },
    ]);
    expect(context.getBody()).toBe(JSON.stringify({
      alpha: {
        value: 'one',
        version: '3',
      },
      beta: {
        value: 'two',
        version: '4',
      },
    }));
  });
});
