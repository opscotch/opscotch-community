import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../../resources/apps/tcp-example/throughput-counter.js');

const suite = createResourceSuite({
  resources: [{ id: 'resource', resource }],
});

describe('apps/tcp-example/throughput-counter', () => {
  it('updates time and count counters from a stream payload', async () => {
    const timestamp = 1_700_000_001_000;
    const context = createJavascriptContext({
      properties: { ts: String(timestamp - 1000) },
      timestamp,
    });
    context.setStreamFromString('a\nb\nc\n');

    await suite.run('resource', { context });

    expect(context.counter('time', 0)).toBe(1000);
    // trailing newline yields an empty final segment: a, b, c, ''
    expect(context.counter('count', 0)).toBe(4);
  });

  it('runs the timer path without throwing when the stream is empty', async () => {
    const context = createJavascriptContext();

    await expect(suite.run('resource', { context })).resolves.toBeDefined();
  });
});
