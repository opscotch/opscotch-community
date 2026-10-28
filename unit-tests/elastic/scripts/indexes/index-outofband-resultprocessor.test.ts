import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(
  import.meta.dirname,
  '../../../../resources/elastic/scripts/indexes/index-outofband-resultprocessor.js',
);

const suite = createResourceSuite({
  resources: [{ id: 'resource', resource }],
});

describe('elastic/scripts/indexes/index-outofband-resultprocessor', () => {
  it('reports new docs written to older indexes in a dated group', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify([
        {
          index: 'logs-2024.01.02',
          'docs.count': '100',
          'pri.store.size': '1',
          'store.size': '1',
        },
        {
          index: 'logs-2024.01.01',
          'docs.count': '50',
          'pri.store.size': '1',
          'store.size': '1',
        },
      ]),
      data: {
        prefix: 'outofband-',
        processroute: 'oob-step',
      },
    });
    context.getTimestampManager().set('OutOfBand-logs-2024.01.01', 40);

    await suite.run('resource', { context });

    expect(context.__sendToStepCalls).toHaveLength(1);
    const payload = JSON.parse(context.__sendToStepCalls[0].body!);
    expect(payload.metric).toBe('outofband-logs');
    expect(payload.value).toBe(10);
    expect(payload.metadata.IndexName).toBe('logs-2024.01.01');
  });
});
