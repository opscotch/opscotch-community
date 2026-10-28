import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(
  import.meta.dirname,
  '../../../../resources/elastic/scripts/indexes/index-count-resultprocessor.js',
);

const suite = createResourceSuite({
  resources: [{ id: 'resource', resource }],
});

describe('elastic/scripts/indexes/index-count-resultprocessor', () => {
  it('sends elastic-index-count as the number of newline-separated rows in the body', async () => {
    const context = createJavascriptContext({
      body: 'one\ntwo\nthree',
      timestamp: 1_700_000_000_000,
    });

    await suite.run('resource', { context });

    expect(context.__metrics).toEqual([
      { args: [1_700_000_000_000, 'elastic-index-count', 3] },
    ]);
  });

  it('counts a single-line body as one row', async () => {
    const context = createJavascriptContext({
      body: 'only-one',
      timestamp: 1_700_000_000_000,
    });

    await suite.run('resource', { context });

    expect(context.__metrics).toEqual([
      { args: [1_700_000_000_000, 'elastic-index-count', 1] },
    ]);
  });
});
