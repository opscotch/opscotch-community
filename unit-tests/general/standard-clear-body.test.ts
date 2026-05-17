import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../resources/general/standard-clear-body.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('standard-clear-body', () => {
  it('clears the current body', async () => {
    const context = createJavascriptContext({ body: 'abc' });

    await suite.run("resource", { context });

    expect(context.getBody()).toBe('');
  });
});
