import path from 'node:path';
import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../resources/general/standard-clear-body.js');

describe('standard-clear-body', () => {
  it('clears the current body', async () => {
    const context = createJavascriptContext({ body: 'abc' });

    await runResource({ resource, context });

    expect(context.getBody()).toBe('');
  });
});
