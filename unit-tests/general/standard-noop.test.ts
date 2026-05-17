import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../resources/general/standard-noop.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('standard-noop', () => {
  it('leaves the context unchanged', async () => {
    const context = createJavascriptContext({
      body: 'hello',
    });

    await suite.run("resource", { context });

    expect(context.getBody()).toBe('hello');
    expect(context.__sendToStepCalls).toHaveLength(0);
  });
});
