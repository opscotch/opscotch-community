import path from 'node:path';
import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../resources/apps/aws/rest-json-api-payloadgenerator.js');

describe('apps/aws/rest-json-api-payloadgenerator', () => {
  it('sets method and content type and serializes the JSON body', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        path: '/v1/items',
        method: 'PATCH',
        body: {
          active: true,
        },
      }),
      headers: {
        'Old-Header': 'remove-me',
      },
    });

    await runResource({ resource, context });

    expect(context.__method).toBe('PATCH');
    expect(context.getProperty('method')).toBe('PATCH');
    expect(context.getHeader('Old-Header')).toBe(null);
    expect(context.getHeader('Content-Type')).toBe('application/json');
    expect(context.getBody()).toBe('{"active":true}');
  });
});
