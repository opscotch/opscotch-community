import { clearLiveToken, loadConnectorConfig, saveConnectorConfig, STORAGE_KEY } from './connectorConfig';

beforeEach(() => localStorage.clear());
test('migrates the legacy polling URL', () => { localStorage.setItem('url', 'http://legacy'); expect(loadConnectorConfig().polling.url).toBe('http://legacy'); });
test('round trips and clears local live credentials', () => { saveConnectorConfig({ activeConnector: 'live', polling: { url: '' }, live: { url: 'wss://metrics', token: 'secret', metricNames: 'cpu', dimensions: '' } }); expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).live.token).toBe('secret'); clearLiveToken(); expect(loadConnectorConfig().live.token).toBe(''); });
