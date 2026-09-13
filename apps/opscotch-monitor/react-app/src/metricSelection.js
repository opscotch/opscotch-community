export const SELECTED_METRIC_STORAGE_KEY = 'opscotch-monitor.selected-metric.v1';

export function loadSelectedMetrics(storage = window.localStorage) {
  try {
    const stored = storage.getItem(SELECTED_METRIC_STORAGE_KEY);
    if (!stored) return [];
    const names = JSON.parse(stored);
    if (Array.isArray(names)) return names.filter(name => typeof name === 'string' && name);
    return [];
  } catch (_) {
    // Earlier versions stored a single metric name as plain text.
    try {
      const metricName = storage.getItem(SELECTED_METRIC_STORAGE_KEY);
      return metricName ? [metricName] : [];
    } catch (_) {
      return [];
    }
  }
}

export function saveSelectedMetrics(metricNames, storage = window.localStorage) {
  try {
    storage.setItem(SELECTED_METRIC_STORAGE_KEY, JSON.stringify(metricNames));
  } catch (_) {}
}
