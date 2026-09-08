import { addObservations, buildSubscribeMessage, HISTORY_LIMIT, parseLiveFrame } from './liveMetrics';

test('constructs subscriptions with optional filters', () => {
  expect(buildSubscribeMessage({})).toEqual({ action: 'subscribe' });
  expect(buildSubscribeMessage({ metricNames: ' cpu_used, memory_used ', dimensions: 'ori=1, deploymentId=abc' })).toEqual({ action: 'subscribe', metric_names: ['cpu_used', 'memory_used'], dimensions: { ori: '1', deploymentId: 'abc' } });
});
test('parses a metric batch and discards malformed values', () => {
  expect(parseLiveFrame(JSON.stringify({ metrics: [{ timestamp: '2026-01-01T00:00:00Z', name: 'cpu', value: 2 }, { name: 'bad', value: 1 }] })).observations).toEqual([{ timestamp: '2026-01-01T00:00:00.000Z', metricName: 'cpu', value: 2, dimensions: {} }]);
  expect(parseLiveFrame('{').error).toMatch(/invalid/i);
});
test('deduplicates timestamps and bounds metric history', () => {
  const records = Array.from({ length: HISTORY_LIMIT + 2 }, (_, index) => ({ metricName: 'cpu', timestamp: new Date(1000 * index).toISOString(), value: index }));
  const series = addObservations({}, records);
  expect(series.cpu).toHaveLength(HISTORY_LIMIT);
  expect(addObservations(series, [{ metricName: 'cpu', timestamp: records.at(-1).timestamp, value: 99 }]).cpu.at(-1).value).toBe(99);
});
