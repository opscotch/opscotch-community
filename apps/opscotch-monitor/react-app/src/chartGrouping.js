export const NO_DEPLOYMENT_ID = 'No deployment ID';

export function deploymentIdForSeries(metricName) {
  const match = String(metricName).match(/\s\[deploymentId=([^\]]+)]$/);
  return match ? match[1] : NO_DEPLOYMENT_ID;
}

export function groupMetricSeries(entries) {
  const groups = new Map();
  entries.forEach(entry => {
    const deploymentId = deploymentIdForSeries(entry[0]);
    const group = groups.get(deploymentId) || [];
    group.push(entry);
    groups.set(deploymentId, group);
  });
  return [...groups.entries()]
    .sort(([left], [right]) => (left === NO_DEPLOYMENT_ID) - (right === NO_DEPLOYMENT_ID) || left.localeCompare(right))
    .map(([deploymentId, series]) => ({ deploymentId, series }));
}
