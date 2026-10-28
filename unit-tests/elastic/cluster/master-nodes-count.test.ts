import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(
  import.meta.dirname,
  '../../../resources/elastic/cluster/master-nodes-count.js',
);

const suite = createResourceSuite({
  resources: [{ id: 'resource', resource }],
});

describe('elastic/cluster/master-nodes-count', () => {
  it('counts master-eligible nodes and forwards the result', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify([
        { name: 'n1', role: 'dim' },
        { name: 'n2', role: 'di' },
        { name: 'n3', role: 'm' },
        { name: 'n4', role: 'him' },
      ]),
      data: { processroute: 'next-step' },
    });

    await suite.run('resource', { context });

    expect(context.__sendToStepCalls).toEqual([
      {
        stepName: 'next-step',
        body: JSON.stringify({ 'master-eligible-nodes': 3 }),
        headers: undefined,
      },
    ]);
  });
});
