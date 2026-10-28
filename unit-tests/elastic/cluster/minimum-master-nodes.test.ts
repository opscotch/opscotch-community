import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(
  import.meta.dirname,
  '../../../resources/elastic/cluster/minimum-master-nodes.js',
);

const suite = createResourceSuite({
  resources: [{ id: 'resource', resource }],
});

describe('elastic/cluster/minimum-master-nodes', () => {
  it('forwards ok (0) when odd master count satisfies minimum_master_nodes', async () => {
    const context = createJavascriptContext({
      body: [
        '# comment line',
        JSON.stringify({
          persistent: {},
          transient: {},
          defaults: { discovery: { zen: { minimum_master_nodes: 1 } } },
        }),
      ].join('\n'),
      properties: { 'master-eligible-nodes': 3 },
      data: { processroute: 'metric-step' },
    });

    await suite.run('resource', { context });

    expect(context.__sendToStepCalls).toHaveLength(1);
    expect(JSON.parse(context.__sendToStepCalls[0].body!)).toEqual({
      metric: 'elastic-cluster-master-eligible-nodes',
      value: 0,
    });
  });

  it('forwards fail (1) when master-eligible count is even', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        persistent: {},
        transient: { discovery: { zen: { minimum_master_nodes: 1 } } },
        defaults: {},
      }),
      properties: { 'master-eligible-nodes': 2 },
      data: { processroute: 'metric-step' },
    });

    await suite.run('resource', { context });

    expect(JSON.parse(context.__sendToStepCalls[0].body!)).toEqual({
      metric: 'elastic-cluster-master-eligible-nodes',
      value: 1,
    });
  });
});
