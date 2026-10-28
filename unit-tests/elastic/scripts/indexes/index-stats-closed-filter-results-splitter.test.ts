import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(
  import.meta.dirname,
  '../../../../resources/elastic/scripts/indexes/index-stats-closed-filter-results-splitter.js',
);

const suite = createResourceSuite({
  resources: [{ id: 'resource', resource }],
});

describe('elastic/scripts/indexes/index-stats-closed-filter-results-splitter', () => {
  it('adds only open indexes as split return items', async () => {
    const open = { index: 'a', status: 'open' };
    const closed = { index: 'b', status: 'close' };
    const context = createJavascriptContext({
      body: JSON.stringify([open, closed, { index: 'c', status: 'open' }]),
    });

    await suite.run('resource', { context });

    expect(context.__splitReturnItems).toEqual([
      JSON.stringify(open),
      JSON.stringify({ index: 'c', status: 'open' }),
    ]);
  });
});
