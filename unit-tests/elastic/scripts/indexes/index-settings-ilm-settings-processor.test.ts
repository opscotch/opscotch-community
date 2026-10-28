import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(
  import.meta.dirname,
  '../../../../resources/elastic/scripts/indexes/index-settings-ilm-settings-processor.js',
);

const suite = createResourceSuite({
  resources: [{ id: 'resource', resource }],
});

describe('elastic/scripts/indexes/index-settings-ilm-settings-processor', () => {
  it('sends the percentage of indexes that have an ILM policy', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        'idx-with-ilm': {
          settings: { index: { lifecycle: { name: 'purge_old' } } },
        },
        'idx-without-ilm': {
          settings: { index: { number_of_shards: '1' } },
        },
      }),
    });

    await suite.run('resource', { context });

    expect(context.__metrics).toEqual([
      { args: ['elastic-ilm-managed-index-pct', 0.5] },
    ]);
    expect(context.__logs[0]).toContain('idx-without-ilm has no ILM policy');
  });
});
