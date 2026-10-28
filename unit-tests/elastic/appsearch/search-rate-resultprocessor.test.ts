import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(
  import.meta.dirname,
  '../../../resources/elastic/appsearch/search-rate-resultprocessor.js',
);

const suite = createResourceSuite({
  resources: [{ id: 'resource', resource }],
});

describe('elastic/appsearch/search-rate-resultprocessor', () => {
  it('sends mapped search and click rate metrics for buckets after lastRun', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        aggregations: {
          counts_by_time: {
            buckets: [
              {
                key: 1_648_522_800_000,
                counts_by_action: {
                  buckets: [
                    { key: 'loco_moco_search', doc_count: 24 },
                    { key: 'loco_moco_click', doc_count: 3 },
                  ],
                },
              },
              {
                key: 1_648_522_860_000,
                counts_by_action: {
                  buckets: [{ key: 'loco_moco_search', doc_count: 18 }],
                },
              },
            ],
          },
        },
      }),
    });

    const tm = context.getTimestampManager();
    tm.set('lastRun', 1_648_522_700_000);
    context.getTimestampManager = () => ({
      ...tm,
      setIfLastest(key: string, value: string) {
        if (Number(value) > tm.get(key)) {
          tm.set(key, value);
        }
      },
    });

    await suite.run('resource', { context });

    expect(context.__metrics).toEqual([
      { args: [1_648_522_800_000, 'elastic-appsearch-search-rate', 24] },
      { args: [1_648_522_800_000, 'elastic-appsearch-click-rate', 3] },
      { args: [1_648_522_860_000, 'elastic-appsearch-search-rate', 18] },
    ]);
    expect(tm.get('lastRun')).toBe(1_648_522_860_000);
  });
});
