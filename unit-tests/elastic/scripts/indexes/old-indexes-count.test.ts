import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(
  import.meta.dirname,
  '../../../../resources/elastic/scripts/indexes/old-indexes-count.js',
);

const suite = createResourceSuite({
  resources: [{ id: 'resource', resource }],
});

describe('elastic/scripts/indexes/old-indexes-count', () => {
  it('counts dated indexes older than days-old and forwards the metric', async () => {
    // 2024-01-15 UTC
    const now = Date.UTC(2024, 0, 15);
    const context = createJavascriptContext({
      body: JSON.stringify([
        { index: 'logs-2024.01.14' },
        { index: 'logs-2024.01.01' },
        { index: 'logs-2023.12.01-000001' },
        { index: '.hidden-2023.01.01' },
        { index: 'nodate' },
      ]),
      data: {
        'days-old': 7,
        processroute: 'old-step',
      },
      timestamp: now,
    });

    await suite.run('resource', { context });

    expect(context.__sendToStepCalls).toEqual([
      {
        stepName: 'old-step',
        body: JSON.stringify({
          metric: 'elastic-indexes-beyond-expiry',
          value: 2,
        }),
        headers: undefined,
      },
    ]);
  });
});
