import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../resources/httpserver/query-params-to-body.js');

const suite = createResourceSuite({
  resources: [{ id: 'resource', resource }],
});

describe('httpserver/query-params-to-body', () => {
  it('extracts a selected query param into the request body', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({ query: '?purpose=box&extra=ignored' }),
      data: {
        extract: JSON.stringify(['purpose']),
      },
    });

    await suite.run('resource', { context });

    expect(JSON.parse(context.getBody() || '{}')).toEqual({
      purpose: 'box',
    });
  });

  it('returns all decoded params when no extract list is provided', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({ query: '?purpose=secretbox&label=hello%20world' }),
    });

    await suite.run('resource', { context });

    expect(JSON.parse(context.getBody() || '{}')).toEqual({
      purpose: 'secretbox',
      label: 'hello world',
    });
  });
});
