import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(
  import.meta.dirname,
  '../../../resources/elastic/appsearch/search-rate-payloadgenerator.js',
);

const suite = createResourceSuite({
  resources: [{ id: 'resource', resource }],
});

describe('elastic/appsearch/search-rate-payloadgenerator', () => {
  it('builds an aggregate search body using lastRun and a floored toTime', async () => {
    const now = 1_700_000_123_456;
    const lastRun = 1_699_000_000_000;
    const context = createJavascriptContext({ timestamp: now });
    context.getTimestampManager().set('lastRun', lastRun);

    await suite.run('resource', { context });

    const toTime = Math.floor(now / 60000) * 60000 - 60000;
    const body = JSON.parse(context.getBody()!);

    expect(body.size).toBe(0);
    expect(body.query.bool.filter[0].range['@timestamp']).toEqual({
      gte: String(lastRun),
      lt: String(toTime),
    });
    expect(body.aggs.counts_by_time.date_histogram.fixed_interval).toBe('1m');
  });

  it('defaults fromTime to seven days ago when lastRun is missing', async () => {
    const now = 1_700_000_000_000;
    const context = createJavascriptContext({ timestamp: now });

    await suite.run('resource', { context });

    const body = JSON.parse(context.getBody()!);
    expect(body.query.bool.filter[0].range['@timestamp'].gte).toBe(
      String(now - 60 * 60 * 24 * 7 * 1000),
    );
  });
});
