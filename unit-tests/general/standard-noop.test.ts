import path from 'node:path';
import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../resources/general/standard-noop.js');

describe('standard-noop', () => {
  it('leaves the context unchanged', async () => {
    const context = createJavascriptContext({
      body: 'hello',
    });

    await runResource({ resource, context });

    expect(context.getBody()).toBe('hello');
    expect(context.__sendToStepCalls).toHaveLength(0);
  });
});
