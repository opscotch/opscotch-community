import { matchesNameCriteria, matchesValueCriteria } from './metricFilters';

test('matches numeric metric-value comparison criteria', () => {
  expect(matchesValueCriteria(undefined, [])).toBe(true);
  expect(matchesValueCriteria(10, [{ operator: 'valueGreaterThan', value: 5 }])).toBe(true);
  expect(matchesValueCriteria(10, [{ operator: 'valueLessThan', value: 5 }])).toBe(false);
  expect(matchesValueCriteria(10, [{ operator: 'valueGreaterThanOrEqual', value: 10 }, { operator: 'valueNotEquals', value: 0 }])).toBe(true);
  expect(matchesValueCriteria(10, [{ operator: 'valueEquals', value: 10 }])).toBe(true);
});

test('matches case-insensitive metric-name contains criteria', () => {
  expect(matchesNameCriteria('service.request.duration', [{ operator: 'contains', value: 'REQUEST' }])).toBe(true);
  expect(matchesNameCriteria('service.request.duration', [{ operator: 'contains', value: 'error' }])).toBe(false);
});
