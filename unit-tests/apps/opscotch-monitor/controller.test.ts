import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../../resources/apps/opscotch-monitor/controller.js');

const suite = createResourceSuite({
  resources: [{ id: 'resource', resource }],
});

describe('apps/opscotch-monitor/controller', () => {
  it('registers a metric name on setmetric', async () => {
    const context = createJavascriptContext({
      properties: { _action: 'setmetric' },
      body: JSON.stringify({ name: 'requests', value: 5 }),
    });

    await suite.run('resource', { context });

    expect(context.getPersistedItem('_metrics')).toContain('requests');
    expect(context.counter('requests', 0)).toBe(5);
  });

  it('returns JSON counters and ends for get-metrics with a body', async () => {
    const context = createJavascriptContext({
      body: '{}',
      persistedItems: {
        _metrics: JSON.stringify(['requests']),
        _timestamp: '12:34:56',
      },
    });
    context.counter('requests', 7);

    await suite.run('resource', { context });

    expect(context.__ended).toBe(true);
    expect(context.getHeader('Access-Control-Allow-Origin')).toBe('*');
    expect(JSON.parse(context.getBody() || '{}')).toEqual({
      timestamp: '12:34:56',
      requests: 7,
    });
  });
});
