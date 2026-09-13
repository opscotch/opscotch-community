import { loadSelectedMetrics, saveSelectedMetrics, SELECTED_METRIC_STORAGE_KEY } from './metricSelection';

beforeEach(() => localStorage.clear());

test('restores selected metrics', () => {
  expect(loadSelectedMetrics()).toEqual([]);
  saveSelectedMetrics(['service.request.duration', 'service.request.count']);
  expect(localStorage.getItem(SELECTED_METRIC_STORAGE_KEY)).toBe('["service.request.duration","service.request.count"]');
  expect(loadSelectedMetrics()).toEqual(['service.request.duration', 'service.request.count']);
});

test('migrates the previous single-metric selection', () => {
  localStorage.setItem(SELECTED_METRIC_STORAGE_KEY, 'service.request.duration');
  expect(loadSelectedMetrics()).toEqual(['service.request.duration']);
});
