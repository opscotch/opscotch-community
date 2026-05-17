import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../resources/apps/aws/jsonrpc-api-payloadgenerator.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('apps/aws/jsonrpc-api-payloadgenerator', () => {
  it('sets JSON-RPC headers and extracts the request body', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        operationName: 'PutItem',
        body: {
          id: 1,
        },
      }),
      data: {
        json_rpc_version: '1.0',
        json_rpc_target_prefix: 'DynamoDB_20120810',
      },
      headers: {
        'Old-Header': 'remove-me',
      },
    });

    await suite.run("resource", { context });

    expect(context.__method).toBe('POST');
    expect(context.getProperty('method')).toBe('POST');
    expect(context.getHeader('Old-Header')).toBe(null);
    expect(context.getHeader('Content-Type')).toBe('application/x-amz-json-1.0');
    expect(context.getHeader('x-amz-target')).toBe('DynamoDB_20120810.PutItem');
    expect(context.getBody()).toBe('{"id":1}');
  });
});
