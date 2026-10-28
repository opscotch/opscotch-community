import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(
  import.meta.dirname,
  '../../../../resources/elastic/scripts/indexes/index-stats-urlgenerator.js',
);

const suite = createResourceSuite({
  resources: [{ id: 'resource', resource }],
});

describe('elastic/scripts/indexes/index-stats-urlgenerator', () => {
  it('sets the stats url for the index in the body', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({ index: 'logs-2024.01.01', status: 'open' }),
      data: { 'host-ref': 'elastic-host' },
    });

    await suite.run('resource', { context });

    expect(context.__url).toEqual({
      hostRef: 'elastic-host',
      path: '/logs-2024.01.01/_stats',
    });
  });
});
