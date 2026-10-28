import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(
  import.meta.dirname,
  '../../../../resources/elastic/scripts/indexes/index-docscount-resultprocessor.js',
);

const suite = createResourceSuite({
  resources: [{ id: 'resource', resource }],
});

describe('elastic/scripts/indexes/index-docscount-resultprocessor', () => {
  it('emits doc/ingest/store diffs for the latest open dated index per group', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify([
        {
          index: 'logs-2024.01.01',
          status: 'open',
          'docs.count': '10',
          'pri.store.size': '100',
          'store.size': '200',
        },
        {
          index: 'logs-2024.01.02',
          status: 'open',
          'docs.count': '25',
          'pri.store.size': '150',
          'store.size': '300',
        },
        {
          index: '.internal-2024.01.02',
          status: 'open',
          'docs.count': '99',
          'pri.store.size': '1',
          'store.size': '1',
        },
      ]),
      data: {
        prefix: 'unused',
        processroute: 'docs-step',
      },
    });

    await suite.run('resource', { context });

    expect(context.__sendToStepCalls).toHaveLength(3);
    const payloads = context.__sendToStepCalls.map((call) => JSON.parse(call.body!));
    expect(payloads.map((p) => ({ metric: p.metric, value: p.value }))).toEqual([
      { metric: 'doc-count-diff-logs', value: 25 },
      { metric: 'ingest-size-diff-logs', value: 150 },
      { metric: 'store-size-diff-logs', value: 300 },
    ]);
  });
});
