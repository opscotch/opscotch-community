import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../resources/tests-only/before-now-test.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('tests-only/before-now-test', () => {
  it('emits duration metrics based on timestamp manager history', async () => {
    const context = createJavascriptContext({
      timestamp: 1_700_000_000_000,
    });

    await suite.run("resource", { context });

    expect(context.__metrics).toEqual([
      { args: ['FIRST', 1440] },
      { args: ['SECOND', 5] },
      { args: ['THIRD', 5] },
      { args: ['FOURTH', 0] },
    ]);
  });
});
