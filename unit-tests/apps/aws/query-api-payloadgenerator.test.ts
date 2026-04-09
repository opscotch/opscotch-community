import path from 'node:path';
import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../resources/apps/aws/query-api-payloadgenerator.js');

describe('apps/aws/query-api-payloadgenerator', () => {
  it('encodes, sorts, and filters query API parameters', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        action: 'Do+Thing',
        params: {
          Zed: 'z',
          Alpha: 'a b',
          Empty: '',
          Missing: null,
        },
      }),
      data: {
        aws_query_api_version: '2012-11-05',
      },
      headers: {
        'Old-Header': 'remove-me',
      },
    });

    await runResource({ resource, context });

    expect(context.__method).toBe('POST');
    expect(context.getProperty('method')).toBe('POST');
    expect(context.getHeader('Old-Header')).toBe(null);
    expect(context.getHeader('Content-Type')).toBe('application/x-www-form-urlencoded; charset=utf-8');
    expect(context.getBody()).toBe('Action=Do%2BThing&Version=2012-11-05&Alpha=a%20b&Zed=z');
  });
});
