import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../resources/general/debug-print-body.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('debug-print-body', () => {
  it('leaves the context unchanged while printing the body', async () => {
    const context = createJavascriptContext({
      body: '{"debug":true}',
    });

    await suite.run("resource", { context });

    expect(context.getBody()).toBe('{"debug":true}');
  });
});
