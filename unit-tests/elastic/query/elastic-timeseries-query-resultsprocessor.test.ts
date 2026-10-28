import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(
  import.meta.dirname,
  '../../../resources/elastic/query/elastic-timeseries-query-resultsprocessor.js',
);

const suite = createResourceSuite({
  resources: [{ id: 'resource', resource }],
});

describe('elastic/query/elastic-timeseries-query-resultsprocessor', () => {
  it('persists max timestamp and forwards hits', async () => {
    const hits = [
      { _id: '1', _source: { eventTime: 1_700_000_000_000 } },
      { _id: '2', _source: { eventTime: 1_700_000_060_000 } },
    ];
    const context = createJavascriptContext({
      body: JSON.stringify({ hits: { hits } }),
      data: {
        processroute: 'ts-step',
        timestampField: 'eventTime',
        idProperty: 'queryId',
      },
      properties: { queryId: 'q1' },
    });

    await suite.run('resource', { context });

    expect(context.__sendToStepCalls).toEqual([
      {
        stepName: 'ts-step',
        body: JSON.stringify(hits),
        headers: undefined,
      },
    ]);
    expect(context.getTimestampManager().get('q1maxTimestamp')).toBe(1_700_000_060_000);
  });
});
