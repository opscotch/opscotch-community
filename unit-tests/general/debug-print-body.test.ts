import path from 'node:path';
import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../resources/general/debug-print-body.js');

describe('debug-print-body', () => {
  it('leaves the context unchanged while printing the body', async () => {
    const context = createJavascriptContext({
      body: '{"debug":true}',
    });

    await runResource({ resource, context });

    expect(context.getBody()).toBe('{"debug":true}');
  });
});
