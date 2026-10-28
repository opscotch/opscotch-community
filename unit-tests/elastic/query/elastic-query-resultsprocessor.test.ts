import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(
  import.meta.dirname,
  '../../../resources/elastic/query/elastic-query-resultsprocessor.js',
);

const suite = createResourceSuite({
  resources: [{ id: 'resource', resource }],
});

describe('elastic/query/elastic-query-resultsprocessor', () => {
  it('forwards hits.hits to the configured process route', async () => {
    const hits = [
      { _id: '1', _source: { a: 1 } },
      { _id: '2', _source: { a: 2 } },
    ];
    const context = createJavascriptContext({
      body: JSON.stringify({ hits: { hits } }),
      data: { processroute: 'hits-step' },
    });

    await suite.run('resource', { context });

    expect(context.__sendToStepCalls).toEqual([
      {
        stepName: 'hits-step',
        body: JSON.stringify(hits),
        headers: undefined,
      },
    ]);
  });
});
