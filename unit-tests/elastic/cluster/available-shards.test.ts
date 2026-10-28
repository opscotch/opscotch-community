import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(
  import.meta.dirname,
  '../../../resources/elastic/cluster/available-shards.js',
);

const suite = createResourceSuite({
  resources: [{ id: 'resource', resource }],
});

describe('elastic/cluster/available-shards', () => {
  it('sends available shards using transient limit minus used shards, ignoring # comments', async () => {
    const context = createJavascriptContext({
      body: [
        '# This is a comment from elasticsearch',
        '{',
        '  "persistent": {},',
        '  "transient": { "cluster": { "max_shards_per_node": "100" } },',
        '  "defaults": { "cluster": { "max_shards_per_node": "1000" } }',
        '}',
      ].join('\n'),
      properties: { 'elastic-used-shards': 40 },
    });

    await suite.run('resource', { context });

    expect(context.__metrics).toEqual([
      { args: ['elastic-cluster-shards-available', 60] },
    ]);
  });

  it('falls back to defaults when transient and persistent limits are absent', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        persistent: {},
        transient: {},
        defaults: { cluster: { max_shards_per_node: '200' } },
      }),
      properties: { 'elastic-used-shards': 50 },
    });

    await suite.run('resource', { context });

    expect(context.__metrics).toEqual([
      { args: ['elastic-cluster-shards-available', 150] },
    ]);
  });
});
