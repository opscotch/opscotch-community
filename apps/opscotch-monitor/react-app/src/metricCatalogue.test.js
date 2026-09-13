import { flattenMetricFields, MetricCatalogue } from './metricCatalogue';

test('indexes nested fields while excluding metric values, timestamps, and type=metric', () => {
  const fields = flattenMetricFields({ timestamp: 'now', value: 12, type: 'metric', dimensions: { host: 'api-1', zone: 'a' }, labels: ['blue'] });
  expect(fields).toEqual(expect.arrayContaining([{ path: 'dimensions.host', value: 'api-1', key: 'string:api-1' }, { path: 'dimensions.zone', value: 'a', key: 'string:a' }, { path: 'labels[]', value: 'blue', key: 'string:blue' }]));
  expect(fields.map(field => field.path)).not.toEqual(expect.arrayContaining(['timestamp', 'value', 'type']));
});

test('filters by composable field criteria and provides compact summaries', () => {
  const catalogue = new MetricCatalogue();
  catalogue.add('requests', { dimensions: { host: 'api-1', zone: 'a' } });
  catalogue.add('errors', { dimensions: { host: 'api-2', zone: 'a' } });
  const api1 = catalogue.values('dimensions.host').find(value => value.value === 'api-1');
  expect(catalogue.matches('requests', '', [{ field: 'dimensions.host', key: api1.key, operator: 'equals' }])).toBe(true);
  expect(catalogue.matches('errors', '', [{ field: 'dimensions.host', key: api1.key, operator: 'equals' }])).toBe(false);
  expect(catalogue.matches('errors', '', [{ field: 'dimensions.host', key: api1.key, operator: 'notEquals' }])).toBe(true);
  expect(catalogue.summary('requests')).toEqual(expect.arrayContaining([{ path: 'dimensions.host', value: 'api-1' }]));
  expect(catalogue.bytes).toBeGreaterThan(0);
});
