import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../resources/tests-only/emptyfile.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('tests-only/emptyfile', () => {
  it('runs without changing the context', async () => {
    const context = createJavascriptContext({
      body: 'keep-me',
    });

    await suite.run("resource", { context });

    expect(context.getBody()).toBe('keep-me');
  });
});
