function byteLength(value) {
  try { return encodeURIComponent(String(value)).replace(/%[\dA-F]{2}|./gi, '_').length; } catch (_) { return String(value).length; }
}
function valueKey(value) { return `${typeof value}:${String(value)}`; }
function isSkipped(path, value) {
  const field = path.split('.').at(-1).replace(/\[\]$/, '');
  return field === 'value' || field === 'timestamp' || (field === 'type' && String(value).toLowerCase() === 'metric');
}

export function flattenMetricFields(value, path = '', result = [], visited = new WeakSet()) {
  if (value === null || typeof value !== 'object') {
    if (path && !isSkipped(path, value)) result.push({ path, value: String(value), key: valueKey(value) });
    return result;
  }
  if (visited.has(value)) return result;
  visited.add(value);
  if (Array.isArray(value)) value.forEach(item => flattenMetricFields(item, `${path}[]`, result, visited));
  else Object.entries(value).forEach(([field, item]) => flattenMetricFields(item, path ? `${path}.${field}` : field, result, visited));
  return result;
}

export class MetricCatalogue {
  constructor() { this.fieldIndex = new Map(); this.metricFields = new Map(); this.bytes = 0; }

  add(metricName, metric) {
    const fields = flattenMetricFields(metric);
    let metricFields = this.metricFields.get(metricName);
    if (!metricFields) { metricFields = new Map(); this.metricFields.set(metricName, metricFields); this.bytes += byteLength(metricName); }
    fields.forEach(({ path, value, key }) => {
      let values = this.fieldIndex.get(path);
      if (!values) { values = new Map(); this.fieldIndex.set(path, values); this.bytes += byteLength(path); }
      let metricNames = values.get(key);
      if (!metricNames) { metricNames = new Set(); values.set(key, metricNames); this.bytes += byteLength(key); }
      if (!metricNames.has(metricName)) { metricNames.add(metricName); this.bytes += byteLength(metricName); }
      let metricValues = metricFields.get(path);
      if (!metricValues) { metricValues = new Map(); metricFields.set(path, metricValues); this.bytes += byteLength(path); }
      if (!metricValues.has(key)) { metricValues.set(key, value); this.bytes += byteLength(key); }
    });
  }

  fields() { return [...this.fieldIndex.keys()].sort((a, b) => a.localeCompare(b)); }
  values(field) { return [...(this.fieldIndex.get(field)?.entries() || [])].map(([key, metricNames]) => ({ key, value: key.slice(key.indexOf(':') + 1), count: metricNames.size })).sort((a, b) => a.value.localeCompare(b.value)); }
  summary(metricName, limit = 6) { const fields = this.metricFields.get(metricName); if (!fields) return []; return [...fields.entries()].flatMap(([path, values]) => [...values.values()].map(value => ({ path, value }))).slice(0, limit); }
  matches(metricName, query, criteria) {
    const loweredQuery = query.trim().toLocaleLowerCase();
    const fields = this.metricFields.get(metricName);
    const textMatches = !loweredQuery || metricName.toLocaleLowerCase().includes(loweredQuery) || [...(fields?.entries() || [])].some(([path, values]) => path.toLocaleLowerCase().includes(loweredQuery) || [...values.values()].some(value => value.toLocaleLowerCase().includes(loweredQuery)));
    if (!textMatches) return false;
    return criteria.every(({ field, key, value, operator }) => {
      if (operator === 'contains') return [...(fields?.get(field)?.values() || [])].some(candidate => candidate.toLocaleLowerCase().includes(String(value).toLocaleLowerCase()));
      if (key?.startsWith('manual:')) return [...(fields?.get(field)?.values() || [])].some(candidate => candidate === String(value));
      const hasValue = this.fieldIndex.get(field)?.get(key)?.has(metricName) || false;
      return operator === 'notEquals' ? !hasValue : hasValue;
    });
  }
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
}
