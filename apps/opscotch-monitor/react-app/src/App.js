import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import './App.css';
import { clearLiveToken, loadConnectorConfig, saveConnectorConfig } from './connectorConfig';
import { addObservations, buildSubscribeMessage, parseLiveFrame } from './liveMetrics';

const MAX_RENDERED_METRICS = 12;
const colours = ['#d33f49', '#2867b2', '#7b2cbf', '#008c95', '#bd6a00', '#198754', '#d63384', '#525252'];

function MetricChart({ metricName, observations, index }) {
  const data = observations.map(({ timestamp, value }) => ({ timestamp: new Date(timestamp).toLocaleTimeString(), value }));
  return <section className="metric-chart"><h2>{metricName}</h2><ResponsiveContainer width="100%" height={260}>
    <LineChart data={data}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="timestamp" minTickGap={32} /><YAxis /><Tooltip /><Legend />
      <Line dataKey="value" name={metricName} type="linear" dot={false} isAnimationActive={false} stroke={colours[index % colours.length]} />
    </LineChart></ResponsiveContainer></section>;
}
function parsePollingMetrics(metricJson) {
  if (!metricJson || !metricJson.timestamp || typeof metricJson !== 'object') return [];
  return Object.entries(metricJson).filter(([name, value]) => name !== 'timestamp' && Number.isFinite(Number(value)))
    .map(([metricName, value]) => ({ timestamp: metricJson.timestamp, metricName, value: Number(value), dimensions: {} }));
}
export default function App() {
  const [config, setConfig] = useState(loadConnectorConfig);
  const [draft, setDraft] = useState(loadConnectorConfig);
  const [showSettings, setShowSettings] = useState(true);
  const [series, setSeries] = useState({});
  const [status, setStatus] = useState({ state: 'disconnected', message: 'Configure a connector to begin.' });
  const socketRef = useRef(null); const retryRef = useRef(null); const generationRef = useRef(0);
  const stopLive = useCallback(() => { generationRef.current += 1; if (retryRef.current) clearTimeout(retryRef.current); retryRef.current = null; if (socketRef.current) { socketRef.current.close(1000, 'Connector stopped'); socketRef.current = null; } }, []);
  useEffect(() => () => stopLive(), [stopLive]);
  useEffect(() => {
    stopLive(); if (config.activeConnector !== 'polling' || !config.polling.url) return undefined;
    let cancelled = false;
    const poll = async () => { try { const response = await fetch(`${config.polling.url.replace(/\/$/, '')}/_metrics`); if (!response.ok) throw new Error(`Polling request failed (${response.status}).`); const metrics = parsePollingMetrics(await response.json()); if (!cancelled) { setSeries(current => addObservations(current, metrics)); setStatus({ state: 'connected', message: metrics.length ? 'Receiving polling metrics.' : 'Connected; waiting for metrics.' }); } } catch (error) { if (!cancelled) setStatus({ state: 'error', message: error.message || 'Unable to retrieve polling metrics.' }); } };
    poll(); const interval = setInterval(poll, 1000); return () => { cancelled = true; clearInterval(interval); };
  }, [config, stopLive]);
  useEffect(() => {
    stopLive(); if (config.activeConnector !== 'live' || !config.live.url) return undefined;
    let cancelled = false; let attempt = 0;
    const connect = () => { const generation = generationRef.current; setStatus({ state: attempt ? 'reconnecting' : 'connecting', message: attempt ? 'Reconnecting to live metrics…' : 'Connecting to live metrics…' }); let socket;
      const schedule = message => { if (cancelled || generation !== generationRef.current) return; const delay = Math.min(30000, 1000 * (2 ** Math.min(attempt++, 5))); setStatus({ state: 'reconnecting', message: `${message || 'Live connection closed.'} Retrying in ${Math.ceil(delay / 1000)} seconds.` }); retryRef.current = setTimeout(connect, delay); };
      try { socket = new WebSocket(config.live.url); } catch (error) { schedule(error.message); return; } socketRef.current = socket;
      socket.onopen = () => { if (cancelled || generation !== generationRef.current) return socket.close(); attempt = 0; socket.send(JSON.stringify(buildSubscribeMessage(config.live))); setStatus({ state: 'connected', message: 'Connected; subscribed to live metrics.' }); };
      socket.onmessage = event => { if (cancelled || generation !== generationRef.current) return; const result = parseLiveFrame(event.data); if (result.error) setStatus({ state: 'error', message: result.error }); if (result.observations.length) setSeries(current => addObservations(current, result.observations)); };
      socket.onerror = () => { if (!cancelled && generation === generationRef.current) setStatus({ state: 'error', message: 'Live connection encountered an error.' }); };
      socket.onclose = event => { if (!cancelled && generation === generationRef.current && event.code !== 1000) schedule(event.code === 4001 || event.code === 4003 ? 'Authentication was rejected.' : 'Live connection closed.'); };
    }; connect(); return () => { cancelled = true; stopLive(); };
  }, [config, stopLive]);
  const save = event => { event.preventDefault(); const saved = saveConnectorConfig(draft); setConfig(saved); setDraft(saved); setShowSettings(false); };
  const updateLive = (field, value) => setDraft(current => ({ ...current, live: { ...current.live, [field]: value } }));
  const clearToken = () => { clearLiveToken(); setDraft(current => ({ ...current, live: { ...current.live, token: '' } })); setConfig(current => ({ ...current, live: { ...current.live, token: '' } })); };
  const metricEntries = Object.entries(series).sort(([a], [b]) => a.localeCompare(b));
  return <main><header><img src="logo.png" alt="Opscotch" /><div><h1>opscotch monitor</h1><p className={`status ${status.state}`}>{status.message}</p></div><button onClick={() => setShowSettings(value => !value)}>Connector settings</button></header>
    {showSettings && <form className="settings" onSubmit={save}><h2>Connector</h2><p>Connection settings, including the token, are stored only in this browser’s local storage. The token is never displayed in status messages.</p>
      <label><input type="radio" checked={draft.activeConnector === 'polling'} onChange={() => setDraft(current => ({ ...current, activeConnector: 'polling' }))} /> Polling</label><input aria-label="Polling URL" type="url" placeholder="https://monitor.example" value={draft.polling.url} onChange={event => setDraft(current => ({ ...current, polling: { url: event.target.value } }))} />
      <label><input type="radio" checked={draft.activeConnector === 'live'} onChange={() => setDraft(current => ({ ...current, activeConnector: 'live' }))} /> Live WebSocket</label><input aria-label="WebSocket URL" type="url" placeholder="wss://metrics.example/live" value={draft.live.url} onChange={event => updateLive('url', event.target.value)} /><input aria-label="Authentication token" type="password" placeholder="Authentication token (if required)" value={draft.live.token} onChange={event => updateLive('token', event.target.value)} autoComplete="off" /><input aria-label="Metric names" placeholder="Metric names, comma separated (all if empty)" value={draft.live.metricNames} onChange={event => updateLive('metricNames', event.target.value)} /><input aria-label="Dimensions" placeholder="Dimensions: key=value, key=value (all if empty)" value={draft.live.dimensions} onChange={event => updateLive('dimensions', event.target.value)} /><div><button type="submit">Save and connect</button><button type="button" onClick={clearToken}>Clear saved token</button></div></form>}
    {!metricEntries.length && <p className="empty">{status.state === 'connected' ? 'No matching metrics have arrived yet.' : 'No metric data to display.'}</p>}<div className="charts">{metricEntries.slice(0, MAX_RENDERED_METRICS).map(([name, observations], index) => <MetricChart key={name} metricName={name} observations={observations} index={index} />)}</div>{metricEntries.length > MAX_RENDERED_METRICS && <p className="overflow">Showing the first {MAX_RENDERED_METRICS} metrics of {metricEntries.length}.</p>}</main>;
}
