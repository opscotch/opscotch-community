import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../resources/httpserver/extract-query-params.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('extract-query-params', () => {
  it('extracts the configured query params into a property', async () => {
    const context = createJavascriptContext({
      body: '{"query":"?a=1&b=two"}',
      data: {
        setProperty: 'queryParams',
        extract: ['a'],
      },
    });

    await suite.run("resource", { context });

    expect(context.getProperty('queryParams')).toBe('{"a":"1"}');
  });
});
