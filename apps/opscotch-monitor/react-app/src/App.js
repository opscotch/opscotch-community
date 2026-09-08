import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import './App.css';
import { isConnectorConfigured, loadConnectorConfig, saveConnectorConfig } from './connectorConfig';
import { addObservations, buildSubscribeMessage, parseLiveFrame, requestMetricsStoreTicket } from './liveMetrics';
import { flattenMetricFields, formatBytes, MetricCatalogue } from './metricCatalogue';
import { matchesValueCriteria } from './metricFilters';
import { loadSelectedMetrics, saveSelectedMetrics } from './metricSelection';

const METRICS_PER_PAGE = 50;
const DEFAULT_MAX_CHARTS = 200;
const colours = ['#d33f49', '#2867b2', '#7b2cbf', '#008c95', '#bd6a00', '#198754', '#d63384', '#525252'];
const TICKET_REQUEST_TIMEOUT_MS = 15000;

function endpointLabel(value) {
  try { return new URL(value).host; } catch (_) { return value; }
}

function MetricChart({ metricName, observations, index }) {
  const data = observations.map(({ timestamp, value }) => ({ timestamp: new Date(timestamp).toLocaleTimeString(), value }));
  return <section className="metric-chart"><h2>{metricName}</h2><ResponsiveContainer width="100%" height={260}>
    <LineChart data={data}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="timestamp" minTickGap={32} /><YAxis tickFormatter={value => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value)} /><Tooltip />
      <Line dataKey="value" name={metricName} type="linear" dot={false} isAnimationActive={false} stroke={colours[index % colours.length]} />
    </LineChart></ResponsiveContainer></section>;
}
function MetricBodyModal({ metricName, metric, onAddCriterion, onClose }) {
  const fields = flattenMetricFields(metric?.raw || metric);
  let body;
  try { body = JSON.stringify(metric?.raw || metric, null, 2); } catch (_) { body = 'The latest metric body could not be displayed.'; }
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="metric-modal" role="dialog" aria-modal="true" aria-label={`Latest metric body for ${metricName}`} onMouseDown={event => event.stopPropagation()}><header><h2>{metricName}</h2><button onClick={onClose}>Close</button></header><p>Latest complete metric body</p><div className="metric-modal-fields">{fields.map(({ path, value, key }) => <span key={`${path}:${key}`}><code>{path}={value}</code><button className="filter-in" aria-label={`Filter in ${path}=${value}`} onClick={() => onAddCriterion(path, value, key, 'equals', { showFeedback: true })}>+</button><button className="filter-out" aria-label={`Filter out ${path}=${value}`} onClick={() => onAddCriterion(path, value, key, 'notEquals', { showFeedback: true })}>−</button></span>)}</div><pre>{body}</pre></section></div>;
}
function parsePollingMetrics(metricJson) {
  if (!metricJson || !metricJson.timestamp || typeof metricJson !== 'object') return [];
  return Object.entries(metricJson).filter(([name, value]) => name !== 'timestamp' && Number.isFinite(Number(value)))
    .map(([metricName, value]) => ({ timestamp: metricJson.timestamp, metricName, value: Number(value), dimensions: {}, raw: metricJson }));
}
export default function App() {
  const [config, setConfig] = useState(loadConnectorConfig);
  const [draft, setDraft] = useState(loadConnectorConfig);
  const [showSettings, setShowSettings] = useState(() => !isConnectorConfigured(loadConnectorConfig()));
  const [series, setSeries] = useState({});
  const [latestMetrics, setLatestMetrics] = useState({});
  const catalogueRef = useRef(new MetricCatalogue());
  const [catalogueBytes, setCatalogueBytes] = useState(0);
  const [metricQuery, setMetricQuery] = useState('');
  const [metricPage, setMetricPage] = useState(0);
  const [selectedMetricNames, setSelectedMetricNames] = useState(() => loadSelectedMetrics().slice(0, DEFAULT_MAX_CHARTS));
  const [maxChartCount, setMaxChartCount] = useState(DEFAULT_MAX_CHARTS);
  const [criteria, setCriteria] = useState([]);
  const [criterionField, setCriterionField] = useState('');
  const [criterionValueKey, setCriterionValueKey] = useState('');
  const [criterionOperator, setCriterionOperator] = useState('equals');
  const [valueOperator, setValueOperator] = useState('valueGreaterThan');
  const [valueFilter, setValueFilter] = useState('');
  const [detailMetricName, setDetailMetricName] = useState(null);
  const [filterFeedback, setFilterFeedback] = useState('');
  const [metricBrowserOpen, setMetricBrowserOpen] = useState(false);
  const [status, setStatus] = useState({ state: 'disconnected', message: 'Configure a connector to begin.' });
  const [connectionInfo, setConnectionInfo] = useState({ ticket: 'Not requested', socket: 'Not opened', metrics: 'No live frames received yet.' });
  const socketRef = useRef(null); const retryRef = useRef(null); const ticketAbortRef = useRef(null); const metricSearchRef = useRef(null); const filterFeedbackTimerRef = useRef(null); const generationRef = useRef(0);
  const stopLive = useCallback(() => { generationRef.current += 1; if (retryRef.current) clearTimeout(retryRef.current); retryRef.current = null; if (ticketAbortRef.current) ticketAbortRef.current.abort(); ticketAbortRef.current = null; if (socketRef.current) { socketRef.current.close(1000, 'Connector stopped'); socketRef.current = null; } }, []);
  const receiveMetrics = useCallback(metrics => { metrics.forEach(metric => catalogueRef.current.add(metric.metricName, metric.raw)); setCatalogueBytes(catalogueRef.current.bytes); setSeries(current => addObservations(current, metrics)); setLatestMetrics(current => { const next = { ...current }; metrics.forEach(metric => { next[metric.metricName] = metric; }); return next; }); }, []);
  useEffect(() => () => { stopLive(); if (filterFeedbackTimerRef.current) clearTimeout(filterFeedbackTimerRef.current); }, [stopLive]);
  useEffect(() => { if (metricBrowserOpen) metricSearchRef.current?.focus(); }, [metricBrowserOpen]);
  useEffect(() => {
    stopLive(); if (config.activeConnector !== 'polling' || !config.polling.url) return undefined;
    let cancelled = false;
    const poll = async () => { try { const response = await fetch(`${config.polling.url.replace(/\/$/, '')}/_metrics`); if (!response.ok) throw new Error(`Polling request failed (${response.status}).`); const metrics = parsePollingMetrics(await response.json()); if (!cancelled) { receiveMetrics(metrics); setStatus({ state: 'connected', message: metrics.length ? 'Receiving polling metrics.' : 'Connected; waiting for metrics.' }); } } catch (error) { if (!cancelled) setStatus({ state: 'error', message: error.message || 'Unable to retrieve polling metrics.' }); } };
    poll(); const interval = setInterval(poll, 1000); return () => { cancelled = true; clearInterval(interval); };
  }, [config, receiveMetrics, stopLive]);
  useEffect(() => {
    stopLive();
    if (config.activeConnector !== 'metricsStore') return undefined;
    if (!config.metricsStore.apiUrl) {
      setStatus({ state: 'disconnected', message: 'Enter a Metrics Store ticket exchange URL to connect.' });
      setConnectionInfo({ ticket: 'Ticket exchange URL is missing', socket: 'Not opened', metrics: 'No live frames received yet.' });
      return undefined;
    }
    if (!config.metricsStore.authorization) {
      setStatus({ state: 'error', message: 'Metrics Store Authorization is required before requesting a ticket.' });
      setConnectionInfo({ ticket: 'Not requested', socket: 'Not opened', metrics: 'No live frames received yet.' });
      return undefined;
    }
    let cancelled = false; let attempt = 0;
    const connect = async () => { const generation = generationRef.current; const retrying = attempt > 0; const host = endpointLabel(config.metricsStore.apiUrl); const controller = new AbortController(); let timedOut = false; let timeout;
      setStatus({ state: retrying ? 'reconnecting' : 'connecting', message: `${retrying ? 'Retrying' : 'Requesting'} a WebSocket ticket from ${host}…` });
      setConnectionInfo(current => ({ ...current, ticket: `Requesting from ${host}`, socket: retrying ? 'Waiting for a fresh ticket' : 'Not opened' }));
      const schedule = message => { if (cancelled || generation !== generationRef.current) return; const delay = Math.min(30000, 1000 * (2 ** Math.min(attempt++, 5))); setConnectionInfo(current => ({ ...current, socket: `Retrying in ${Math.ceil(delay / 1000)} seconds` })); setStatus({ state: 'reconnecting', message: `${message || 'Live connection closed.'} Retrying in ${Math.ceil(delay / 1000)} seconds.` }); retryRef.current = setTimeout(connect, delay); };
      let socket;
      try {
        ticketAbortRef.current = controller;
        timeout = setTimeout(() => { timedOut = true; controller.abort(); }, TICKET_REQUEST_TIMEOUT_MS);
        const ticketUrl = await requestMetricsStoreTicket(config.metricsStore.apiUrl, config.metricsStore.authorization, fetch, controller.signal);
        clearTimeout(timeout); ticketAbortRef.current = null;
        if (cancelled || generation !== generationRef.current) return;
        setStatus({ state: 'connecting', message: 'Ticket received. Opening the live WebSocket…' });
        setConnectionInfo(current => ({ ...current, ticket: 'Ticket received', socket: 'Opening WebSocket' }));
        socket = new WebSocket(ticketUrl);
      } catch (error) {
        clearTimeout(timeout); ticketAbortRef.current = null;
        setConnectionInfo(current => ({ ...current, ticket: timedOut ? 'Timed out after 15 seconds' : `Failed: ${error.message || 'ticket exchange error'}`, socket: 'Not opened' }));
        schedule(timedOut ? 'Ticket exchange timed out after 15 seconds.' : error.message);
        return;
      }
      socketRef.current = socket;
      socket.onopen = () => { if (cancelled || generation !== generationRef.current) return socket.close(); attempt = 0; socket.send(JSON.stringify(buildSubscribeMessage(config.metricsStore))); setConnectionInfo(current => ({ ...current, socket: 'Connected; subscription sent' })); setStatus({ state: 'connected', message: 'WebSocket connected. Waiting for matching metrics.' }); };
      socket.onmessage = event => { if (cancelled || generation !== generationRef.current) return; const result = parseLiveFrame(event.data); if (result.error) { setConnectionInfo(current => ({ ...current, metrics: result.error })); setStatus({ state: 'error', message: result.error }); } if (result.observations.length) { receiveMetrics(result.observations); setConnectionInfo(current => ({ ...current, metrics: `Received ${result.observations.length} metric${result.observations.length === 1 ? '' : 's'} at ${new Date().toLocaleTimeString()}` })); setStatus({ state: 'connected', message: 'WebSocket connected. Receiving live metrics.' }); } };
      socket.onerror = () => { if (!cancelled && generation === generationRef.current) { setConnectionInfo(current => ({ ...current, socket: 'WebSocket reported an error' })); setStatus({ state: 'error', message: 'Live WebSocket encountered an error; waiting to retry.' }); } };
      socket.onclose = event => { if (!cancelled && generation === generationRef.current && event.code !== 1000) { setConnectionInfo(current => ({ ...current, socket: `Closed (code ${event.code || 'unknown'})` })); schedule(event.code === 4001 || event.code === 4003 ? 'Authentication was rejected.' : `Live WebSocket closed (code ${event.code || 'unknown'}).`); } };
    }; connect(); return () => { cancelled = true; stopLive(); };
  }, [config, receiveMetrics, stopLive]);
  const save = event => { event.preventDefault(); const saved = saveConnectorConfig(draft); setConfig(saved); setDraft(saved); setShowSettings(false); };
  const updateMetricsStore = (field, value) => setDraft(current => ({ ...current, metricsStore: { ...current.metricsStore, [field]: value } }));
  const metricEntries = useMemo(() => Object.entries(series).sort(([a], [b]) => a.localeCompare(b)), [series]);
  const catalogue = catalogueRef.current;
  const catalogueFields = catalogue.fields();
  const criterionValues = criterionField ? catalogue.values(criterionField) : [];
  const fieldCriteria = criteria.filter(criterion => criterion.operator !== 'nonZero' && criterion.kind !== 'metricValue');
  const valueCriteria = criteria.filter(criterion => criterion.kind === 'metricValue');
  const matchingMetricEntries = metricEntries.filter(([name, observations]) => catalogue.matches(name, metricQuery, fieldCriteria) && (!criteria.some(criterion => criterion.operator === 'nonZero') || Number(observations.at(-1)?.value) !== 0) && matchesValueCriteria(observations.at(-1)?.value, valueCriteria));
  const pageCount = Math.max(1, Math.ceil(matchingMetricEntries.length / METRICS_PER_PAGE));
  const pageEntries = matchingMetricEntries.slice(metricPage * METRICS_PER_PAGE, (metricPage + 1) * METRICS_PER_PAGE);
  const selectedMetricEntries = metricEntries.filter(([name]) => selectedMetricNames.includes(name));
  const showFilterFeedback = message => { if (filterFeedbackTimerRef.current) clearTimeout(filterFeedbackTimerRef.current); setFilterFeedback(message); filterFeedbackTimerRef.current = setTimeout(() => setFilterFeedback(''), 3000); };
  const setSelection = transform => setSelectedMetricNames(current => { const requested = [...new Set(transform(current))]; const next = requested.slice(0, maxChartCount); if (requested.length > next.length) showFilterFeedback(`Chart selection is capped at ${maxChartCount}.`); saveSelectedMetrics(next); return next; });
  const toggleMetricSelection = name => setSelection(current => current.includes(name) ? current.filter(selected => selected !== name) : [...current, name]);
  const addCriterion = (field, value, key, operator = 'equals', { showFeedback = false } = {}) => { if (!field || !key) return; let added = false; setCriteria(current => { if (current.some(criterion => criterion.field === field && criterion.key === key && criterion.operator === operator)) return current; added = true; return [...current, { field, value, key, operator }]; }); setMetricPage(0); if (showFeedback) showFilterFeedback(`${added ? 'Applied' : 'Already active'} filter: ${field} ${operator === 'equals' ? '=' : '≠'} ${value}`); };
  const addBuiltCriterion = () => { const value = criterionValues.find(item => item.key === criterionValueKey); if (value) addCriterion(criterionField, value.value, value.key, criterionOperator); };
  const addValueCriterion = () => { if (!Number.isFinite(Number(valueFilter))) return; setCriteria(current => [...current, { kind: 'metricValue', field: 'value', value: Number(valueFilter), key: `${valueOperator}:${valueFilter}`, operator: valueOperator }]); setMetricPage(0); };
  return <main><header><img src="logo.png" alt="Opscotch" /><div><h1>opscotch monitor</h1><p className={`status ${status.state}`}>{status.message}</p></div><button onClick={() => setShowSettings(value => !value)}>Connector settings</button></header>
    {showSettings && <form className="settings" onSubmit={save}><h2>Connector</h2><p>Connection settings are stored only in this browser’s local storage. The Metrics Store API receives the configured Authorization header and must return a short-lived browser WebSocket URL.</p>
      <label><input type="radio" checked={draft.activeConnector === 'polling'} onChange={() => setDraft(current => ({ ...current, activeConnector: 'polling' }))} /> Polling</label><input aria-label="Polling URL" type="url" placeholder="https://monitor.example" value={draft.polling.url} onChange={event => setDraft(current => ({ ...current, polling: { url: event.target.value } }))} />
      <label><input type="radio" checked={draft.activeConnector === 'metricsStore'} onChange={() => setDraft(current => ({ ...current, activeConnector: 'metricsStore' }))} /> Opscotch Metrics Store</label><input aria-label="Metrics Store API URL" type="url" placeholder="https://metrics-store.example/ticket" value={draft.metricsStore.apiUrl} onChange={event => updateMetricsStore('apiUrl', event.target.value)} /><input aria-label="Metrics Store Authorization" type="password" placeholder="Authorization (for example, Bearer v2.…)" value={draft.metricsStore.authorization} onChange={event => updateMetricsStore('authorization', event.target.value)} autoComplete="off" /><input aria-label="Metric names" placeholder="Metric names, comma separated (all if empty)" value={draft.metricsStore.metricNames} onChange={event => updateMetricsStore('metricNames', event.target.value)} /><input aria-label="Dimensions" placeholder="Dimensions: key=value, key=value (all if empty)" value={draft.metricsStore.dimensions} onChange={event => updateMetricsStore('dimensions', event.target.value)} /><div><button type="submit">Save and connect</button></div></form>}
    {config.activeConnector === 'metricsStore' && <section className="connection-details" aria-label="Live connection activity"><h2>Live connection activity</h2><dl><dt>Ticket exchange</dt><dd>{connectionInfo.ticket}</dd><dt>WebSocket</dt><dd>{connectionInfo.socket}</dd><dt>Metrics</dt><dd>{connectionInfo.metrics}</dd><dt>Metric catalogue</dt><dd>{formatBytes(catalogueBytes)} indexed</dd></dl></section>}
    {!metricEntries.length && <p className="empty">{status.state === 'connected' ? 'No matching metrics have arrived yet.' : 'No metric data to display.'}</p>}
    {!!metricEntries.length && <section className="metric-search" aria-label="Metric search"><label htmlFor="metric-search">Browse {metricEntries.length} metrics</label><input id="metric-search" ref={metricSearchRef} aria-label="Find a metric" type="search" placeholder="Find a metric" value={metricQuery} onFocus={() => setMetricBrowserOpen(true)} onChange={event => { setMetricQuery(event.target.value); setMetricPage(0); setMetricBrowserOpen(true); }} /><label className="chart-cap" htmlFor="chart-cap">Max charts <input id="chart-cap" aria-label="Maximum charts" type="number" min="1" value={maxChartCount} onChange={event => { const next = Math.max(1, Number(event.target.value) || 1); setMaxChartCount(next); setSelectedMetricNames(current => { const capped = current.slice(0, next); saveSelectedMetrics(capped); return capped; }); }} /></label><span>{selectedMetricNames.length} chart{selectedMetricNames.length === 1 ? '' : 's'} selected</span>{!!selectedMetricNames.length && <button className="clear-selection" onClick={() => setSelection(() => [])}>Clear</button>}</section>}
    {!!filterFeedback && <p className="filter-feedback" role="status">{filterFeedback}</p>}
    {!!metricEntries.length && metricBrowserOpen && <section className="metric-browser" aria-label="Metric browser"><div className="metric-browser-heading"><h2>Metrics ({metricEntries.length})</h2><button onClick={() => setMetricBrowserOpen(false)}>Close</button></div><p className="selection-help">Click a metric to add or remove its chart. {selectedMetricNames.length} selected.</p><div className="criteria-builder"><select aria-label="Filter field" value={criterionField} onChange={event => { setCriterionField(event.target.value); setCriterionValueKey(''); }}><option value="">Choose field…</option>{catalogueFields.map(field => <option key={field}>{field}</option>)}</select><select aria-label="Filter operator" value={criterionOperator} onChange={event => setCriterionOperator(event.target.value)}><option value="equals">is</option><option value="notEquals">is not</option></select><select aria-label="Filter value" value={criterionValueKey} onChange={event => setCriterionValueKey(event.target.value)} disabled={!criterionField}><option value="">Choose value…</option>{criterionValues.map(({ key, value, count }) => <option key={key} value={key}>{value} ({count})}</option>)}</select><button disabled={!criterionValueKey} onClick={addBuiltCriterion}>Add filter</button><button onClick={() => { setCriteria(current => current.some(criterion => criterion.operator === 'nonZero') ? current : [...current, { field: 'value', value: 'non-zero', key: '', operator: 'nonZero' }]); setMetricPage(0); }}>Non-zero value</button></div><div className="value-filter"><strong>Metric value</strong><select aria-label="Metric value comparison" value={valueOperator} onChange={event => setValueOperator(event.target.value)}><option value="valueEquals">is</option><option value="valueNotEquals">is not</option><option value="valueGreaterThan">is greater than</option><option value="valueGreaterThanOrEqual">is at least</option><option value="valueLessThan">is less than</option><option value="valueLessThanOrEqual">is at most</option></select><input aria-label="Metric value" type="number" value={valueFilter} onChange={event => setValueFilter(event.target.value)} /><button disabled={!Number.isFinite(Number(valueFilter))} onClick={addValueCriterion}>Add value filter</button></div>{!!criteria.length && <div className="criteria-list">{criteria.map((criterion, index) => <span key={`${criterion.field}:${criterion.key}:${criterion.operator}`}>{criterion.operator === 'nonZero' ? 'value ≠ 0' : criterion.kind === 'metricValue' ? <>value {({ valueEquals: '=', valueNotEquals: '≠', valueGreaterThan: '>', valueGreaterThanOrEqual: '≥', valueLessThan: '<', valueLessThanOrEqual: '≤' })[criterion.operator]} {criterion.value}</> : <>{criterion.field} {criterion.operator === 'equals' ? '=' : '≠'} {criterion.value}</>}<button aria-label={`Remove ${criterion.field} criterion`} onClick={() => { setCriteria(current => current.filter((_, itemIndex) => itemIndex !== index)); setMetricPage(0); }}>×</button></span>)}</div>}<div className="bulk-actions"><button onClick={() => setSelection(current => [...new Set([...current, ...matchingMetricEntries.map(([name]) => name)])])}>Select filtered ({matchingMetricEntries.length})</button><button onClick={() => setSelection(current => current.filter(name => !matchingMetricEntries.some(([match]) => match === name)))}>Unselect filtered</button><button onClick={() => setSelection(() => [])}>Clear</button></div>
      {!matchingMetricEntries.length ? <p className="empty">No metrics match the current search and filters.</p> : <><div className="metric-pagination"><span>Showing {metricPage * METRICS_PER_PAGE + 1}–{Math.min((metricPage + 1) * METRICS_PER_PAGE, matchingMetricEntries.length)} of {matchingMetricEntries.length}</span><div><button disabled={metricPage === 0} onClick={() => setMetricPage(current => current - 1)}>Previous</button><span>Page {metricPage + 1} of {pageCount}</span><button disabled={metricPage + 1 === pageCount} onClick={() => setMetricPage(current => current + 1)}>Next</button></div></div><ul className="metric-list">{pageEntries.map(([name, observations]) => { const latest = observations.at(-1); const selected = selectedMetricNames.includes(name); const summary = catalogue.summary(name); return <li key={name}><div className={selected ? 'metric-list-item selected' : 'metric-list-item'}><button className="metric-select" aria-pressed={selected} onClick={() => toggleMetricSelection(name)}><strong>{name}</strong><span>{selected ? 'Chart selected · ' : ''}Latest: {latest.value} · {new Date(latest.timestamp).toLocaleString()}</span></button><div className="field-summary">{summary.map(({ path, value }) => { const item = catalogue.values(path).find(candidate => candidate.value === value); return <span key={`${path}:${value}`}>{path}={value}<button className="filter-in" aria-label={`Filter in ${path}=${value}`} onClick={() => item && addCriterion(path, value, item.key, 'equals', { showFeedback: true })}>+</button><button className="filter-out" aria-label={`Filter out ${path}=${value}`} onClick={() => item && addCriterion(path, value, item.key, 'notEquals', { showFeedback: true })}>−</button></span>; })}</div></div></li>; })}</ul></>}</section>}
    {!!selectedMetricEntries.length && <div className="charts">{selectedMetricEntries.map(([name, observations], index) => <div key={name}><MetricChart metricName={name} observations={observations} index={index} /><button className="metric-body-button" aria-label={`View latest metric body for ${name}`} title="View latest metric body" onClick={() => setDetailMetricName(name)}>{'{}'}</button></div>)}</div>}{detailMetricName && <MetricBodyModal metricName={detailMetricName} metric={latestMetrics[detailMetricName]} onAddCriterion={addCriterion} onClose={() => setDetailMetricName(null)} />}</main>;
}
