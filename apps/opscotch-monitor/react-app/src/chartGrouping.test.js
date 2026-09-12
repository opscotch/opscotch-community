import { deploymentIdForSeries, groupMetricSeries, NO_DEPLOYMENT_ID } from './chartGrouping';

test('derives deployment groups from deployment-aware series names', () => {
  expect(deploymentIdForSeries('cpu [deploymentId=blue]')).toBe('blue');
  expect(deploymentIdForSeries('cpu')).toBe(NO_DEPLOYMENT_ID);
  expect(groupMetricSeries([['cpu [deploymentId=green]', []], ['memory [deploymentId=blue]', []], ['uptime', []]])).toEqual([
    { deploymentId: 'blue', series: [['memory [deploymentId=blue]', []]] },
    { deploymentId: 'green', series: [['cpu [deploymentId=green]', []]] },
    { deploymentId: NO_DEPLOYMENT_ID, series: [['uptime', []]] },
  ]);
});
