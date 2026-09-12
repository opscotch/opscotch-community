import { addObservations, buildSubscribeMessage, HISTORY_LIMIT, metricSeriesName, parseLiveFrame, requestMetricsStoreTicket } from './liveMetrics';

test('constructs subscriptions with optional filters', () => {
  expect(buildSubscribeMessage({})).toEqual({ action: 'subscribe' });
  expect(buildSubscribeMessage({ metricNames: ' cpu_used, memory_used ', dimensions: 'ori=1, deploymentId=abc' })).toEqual({ action: 'subscribe', metric_names: ['cpu_used', 'memory_used'], dimensions: { ori: '1', deploymentId: 'abc' } });
});
test('parses a metric batch and retains the complete latest metric body', () => {
  const metric = { timestamp: '2026-01-01T00:00:00Z', name: 'cpu', value: 2, dimensions: { host: 'api-1' }, trace: { requestId: 'abc' } };
  expect(parseLiveFrame(JSON.stringify({ metrics: [metric, { name: 'bad', value: 1 }] })).observations).toEqual([{ timestamp: '2026-01-01T00:00:00.000Z', metricName: 'cpu', sourceMetricName: 'cpu', value: 2, dimensions: { host: 'api-1' }, raw: metric }]);
  expect(parseLiveFrame('{').error).toMatch(/invalid/i);
});
test('uses deploymentId to keep same-named metric streams separate', () => {
  expect(metricSeriesName('cpu', { dimensionMap: { deploymentId: 'blue' } })).toBe('cpu [deploymentId=blue]');
  expect(metricSeriesName('cpu', { dimensions: { deploymentId: 'ignored' } })).toBe('cpu');
  expect(metricSeriesName('cpu', { deploymentId: 'ignored' })).toBe('cpu');
  const observations = parseLiveFrame({ metrics: [
    { timestamp: '2026-01-01T00:00:00Z', name: 'cpu', value: 1, dimensionMap: { deploymentId: 'blue' } },
    { timestamp: '2026-01-01T00:00:00Z', name: 'cpu', value: 2, dimensionMap: { deploymentId: 'green' } },
  ] }).observations;
  expect(Object.keys(addObservations({}, observations))).toEqual(['cpu [deploymentId=blue]', 'cpu [deploymentId=green]']);
});
test('deduplicates timestamps and bounds metric history', () => {
  const records = Array.from({ length: HISTORY_LIMIT + 2 }, (_, index) => ({ metricName: 'cpu', timestamp: new Date(1000 * index).toISOString(), value: index }));
  const series = addObservations({}, records);
  expect(series.cpu).toHaveLength(HISTORY_LIMIT);
  expect(addObservations(series, [{ metricName: 'cpu', timestamp: records.at(-1).timestamp, value: 99 }]).cpu.at(-1).value).toBe(99);
});
test('requests and validates a Metrics Store browser ticket', async () => {
  const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ url: 'wss://metrics.example/live?ticket=one-time' }) });
  await expect(requestMetricsStoreTicket('https://metrics.example/ticket', 'Bearer v2.reader.signature', fetchImpl)).resolves.toBe('wss://metrics.example/live?ticket=one-time');
  expect(fetchImpl).toHaveBeenCalledWith('https://metrics.example/ticket', { method: 'POST', headers: { Authorization: 'Bearer v2.reader.signature' } });
  await expect(requestMetricsStoreTicket('https://metrics.example/ticket')).rejects.toThrow(/Authorization is required/i);
  await expect(requestMetricsStoreTicket('https://metrics.example/ticket', 'Bearer v2.reader.signature', async () => ({ ok: true, json: async () => ({ url: 'https://not-a-websocket' }) }))).rejects.toThrow(/invalid WebSocket URL/i);
});
