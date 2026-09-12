import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import './App.css';
import { isConnectorConfigured, loadConnectorConfig, saveConnectorConfig } from './connectorConfig';
import { addObservations, buildSubscribeMessage, parseLiveFrame, requestMetricsStoreTicket } from './liveMetrics';
import { flattenMetricFields, formatBytes, MetricCatalogue } from './metricCatalogue';
import { matchesNameCriteria, matchesValueCriteria } from './metricFilters';
import { loadSelectedMetrics, saveSelectedMetrics } from './metricSelection';
import { groupMetricSeries, NO_DEPLOYMENT_ID } from './chartGrouping';

const METRICS_PER_PAGE = 50;
const DEFAULT_MAX_CHARTS = 200;
const FILTER_DEBOUNCE_MS = 250;
const METRIC_RENDER_BATCH_MS = 250;
const CRITERIA_REFRESH_MS = 1000;
const CHART_CLOCK_MS = 1000;
const STALE_METRIC_MS = 5000;
const colours = ['#d33f49', '#2867b2', '#7b2cbf', '#008c95', '#bd6a00', '#198754', '#d63384', '#525252'];
const TICKET_REQUEST_TIMEOUT_MS = 15000;

function endpointLabel(value) {
  try { return new URL(value).host; } catch (_) { return value; }
}
function flashFilterButton(button) { button.classList.remove('filter-flash'); void button.offsetWidth; button.classList.add('filter-flash'); setTimeout(() => button.classList.remove('filter-flash'), 650); }

function MetricChart({ metricName, observations, index, now }) {
  const latestTimestamp = new Date(observations.at(-1)?.timestamp).getTime();
  const isStale = !Number.isFinite(latestTimestamp) || now - latestTimestamp > STALE_METRIC_MS;
  const data = [...observations.map(({ timestamp, value }) => ({ timestamp: new Date(timestamp).getTime(), value })), { timestamp: now, value: null }];
  const formatTime = value => new Date(value).toLocaleTimeString();
  return <section className="metric-chart"><h2>{metricName}</h2>{isStale && <span className="metric-stale" role="img" aria-label="Waiting for a fresh sample" title="Waiting for a fresh sample">⌛</span>}<ResponsiveContainer width="100%" height={260}>
    <LineChart data={data}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="timestamp" domain={['dataMin', 'dataMax']} minTickGap={32} tickFormatter={formatTime} type="number" /><YAxis tickFormatter={value => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value)} /><Tooltip labelFormatter={formatTime} />
      <Line dataKey="value" name={metricName} type="linear" dot={false} isAnimationActive={false} stroke={colours[index % colours.length]} />
    </LineChart></ResponsiveContainer></section>;
}
function MetricBodyModal({ metricName, metric, onAddCriterion, onClose }) {
  const fields = flattenMetricFields(metric?.raw || metric);
  let body;
  try { body = JSON.stringify(metric?.raw || metric, null, 2); } catch (_) { body = 'The latest metric body could not be displayed.'; }
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="metric-modal" role="dialog" aria-modal="true" aria-label={`Latest metric body for ${metricName}`} onMouseDown={event => event.stopPropagation()}><header><h2>{metricName}</h2><button onClick={onClose}>Close</button></header><p>Latest complete metric body</p><div className="metric-modal-fields">{fields.map(({ path, value, key }) => <span key={`${path}:${key}`}><code>{path}={value}</code><button className="filter-in" aria-label={`Filter in ${path}=${value}`} onClick={event => { onAddCriterion(path, value, key, 'equals'); flashFilterButton(event.currentTarget); }}>+</button><button className="filter-out" aria-label={`Filter out ${path}=${value}`} onClick={event => { onAddCriterion(path, value, key, 'notEquals'); flashFilterButton(event.currentTarget); }}>−</button></span>)}</div><pre>{body}</pre></section></div>;
}
function SearchablePicker({ ariaLabel, disabled = false, emptyLabel = 'No matches found.', onCreate, onSelect, options, placeholder, selectedKey }) {
  const optionsId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);
  const selected = options.find(option => option.key === selectedKey);
  const matches = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return options.filter(option => !normalized || option.searchText.toLocaleLowerCase().includes(normalized)).slice(0, 100);
  }, [options, query]);
  const canCreate = Boolean(onCreate && query.trim() && !options.some(option => option.label.toLocaleLowerCase() === query.trim().toLocaleLowerCase()));
  const choose = option => { onSelect(option); setQuery(''); setIsEditing(false); setIsOpen(false); };
  return <div className="searchable-picker">
    <input ref={inputRef} aria-controls={optionsId} aria-label={ariaLabel} aria-autocomplete="list" aria-expanded={isOpen} role="combobox" disabled={disabled} placeholder={placeholder} value={isEditing ? query : (selected?.label || '')} onFocus={() => { setIsEditing(true); setQuery(''); setIsOpen(true); }} onChange={event => { setQuery(event.target.value); setIsEditing(true); setIsOpen(true); }} onKeyDown={event => { if (event.key === 'Escape') { setIsOpen(false); setIsEditing(false); inputRef.current?.blur(); } }} onBlur={() => { window.setTimeout(() => { setIsOpen(false); setIsEditing(false); }, 120); }} />
    {isOpen && !disabled && <div className="searchable-picker-options" id={optionsId} role="listbox" aria-label={`${ariaLabel} options`}>
      {matches.length ? matches.map(option => <button type="button" key={option.key} role="option" aria-selected={option.key === selectedKey} onMouseDown={event => event.preventDefault()} onClick={() => choose(option)}><span>{option.label}</span>{option.detail && <small>{option.detail}</small>}</button>) : <p>{emptyLabel}</p>}
      {canCreate && <button type="button" className="searchable-picker-create" onMouseDown={event => event.preventDefault()} onClick={() => { onCreate(query.trim()); setQuery(''); setIsEditing(false); setIsOpen(false); }}>Use “{query.trim()}”</button>}
      {matches.length === 100 && <p>Showing the first 100 matches. Keep typing to narrow them.</p>}
    </div>}
  </div>;
}

function MetricBrowserPanel({ activeGroupId, addBuiltCriterion, addNonZeroCriterion, browserResultsReady, catalogue, catalogueFields, criterionField, criterionIsName, criterionIsValue, criterionLabel, criterionOperator, criterionText, criterionValueKey, criterionValues, criteriaGroups, debouncedMetricQuery, matchingMetricEntries, metricEntries, metricPage, onAddCriterion, onCancelGroup, onClose, onCriterionFieldChange, onCriterionOperatorChange, onCriterionTextChange, onCriterionValueChange, onMetricPageChange, onQueryChange, onSetActiveGroup, pageCount, pageEntries, selectedMetricNames, setCriteria, setSelection, toggleMetricSelection }) {
  const fieldOptions = useMemo(() => [{ key: '__name', label: 'Name', searchText: 'name metric name' }, { key: '__value', label: 'Metric value', searchText: 'metric value value number' }, ...(criterionField && !['__name', '__value'].includes(criterionField) && !catalogueFields.includes(criterionField) ? [{ key: criterionField, label: criterionField, searchText: criterionField }] : []), ...catalogueFields.map(field => ({ key: field, label: field, searchText: field }))], [catalogueFields, criterionField]);
  const valueOptions = useMemo(() => [...(criterionValueKey.startsWith('manual:') ? [{ key: criterionValueKey, value: criterionText, count: 0 }] : []), ...criterionValues].map(item => ({ key: item.key, label: item.value, detail: item.count ? `${item.count} metric${item.count === 1 ? '' : 's'}` : 'Typed value', searchText: item.value })), [criterionText, criterionValueKey, criterionValues]);
  const needsTextValue = criterionIsName || criterionOperator === 'contains';
  const needsNumberValue = criterionIsValue && criterionOperator !== 'nonZero';
  const canAdd = criterionIsValue && criterionOperator === 'nonZero' ? true : needsTextValue ? Boolean(criterionText.trim()) : needsNumberValue ? Number.isFinite(Number(criterionText)) : Boolean(criterionValueKey);
  return <div className="metric-browser-overlay" role="presentation"><section className="metric-browser" aria-label="Metric browser"><div className="metric-browser-heading"><h2>Metrics ({metricEntries.length})</h2><button onClick={onClose}>Close</button></div><p className="selection-help">Click a metric to add or remove its chart. {selectedMetricNames.length} selected.</p>
    <div className="criteria-builder">
      <SearchablePicker ariaLabel="Filter field" options={fieldOptions} selectedKey={criterionField} onCreate={onCriterionFieldChange} onSelect={option => onCriterionFieldChange(option.key)} placeholder="Choose or search for a field…" />
      <select aria-label="Filter operator" value={criterionOperator} onChange={event => onCriterionOperatorChange(event.target.value)} disabled={!criterionField}>
        {criterionIsName ? <option value="contains">contains</option> : criterionIsValue ? <><option value="valueEquals">is</option><option value="valueNotEquals">is not</option><option value="valueGreaterThan">is greater than</option><option value="valueGreaterThanOrEqual">is at least</option><option value="valueLessThan">is less than</option><option value="valueLessThanOrEqual">is at most</option><option value="nonZero">is non-zero</option></> : <><option value="equals">is</option><option value="notEquals">is not</option>{criterionValues.some(item => item.key.startsWith('string:')) && <option value="contains">contains</option>}</>}
      </select>
      {needsTextValue ? <input aria-label="Filter text value" type="search" placeholder={criterionIsName ? 'Text to find in metric name' : 'Text to find'} value={criterionText} onChange={event => onCriterionTextChange(event.target.value)} /> : needsNumberValue ? <input aria-label="Metric value" type="number" placeholder="Number" value={criterionText} onChange={event => onCriterionTextChange(event.target.value)} /> : criterionIsValue ? <span className="criterion-no-value">Matches any non-zero latest value</span> : <SearchablePicker ariaLabel="Filter value" disabled={!criterionField} options={valueOptions} selectedKey={criterionValueKey} onCreate={value => onCriterionValueChange(`manual:${value}`, value)} onSelect={option => onCriterionValueChange(option.key)} placeholder="Search or type a value…" emptyLabel="No indexed values match yet." />}
      <button disabled={!canAdd} onClick={addBuiltCriterion}>{activeGroupId ? 'Add alternative' : 'Add filter'}</button>{activeGroupId && <button onClick={onCancelGroup}>Cancel group</button>}
    </div>
    <button className="non-zero-preset" onClick={addNonZeroCriterion}>Add non-zero value</button>
    {(criteriaGroups.length || debouncedMetricQuery) && <div className="criterion-groups">{debouncedMetricQuery && <div className="criterion-group"><strong>Quick name search</strong><span>name contains {debouncedMetricQuery}<button aria-label="Remove quick name criterion" onClick={() => onQueryChange('')}>×</button></span></div>}{criteriaGroups.map(group => <div className="criterion-group" key={group.id}><header><strong>Match any of these (OR)</strong><button onClick={() => setCriteria(current => current.filter(criterion => criterion.groupId !== group.id))}>Remove group</button></header><div className="criteria-list">{group.criteria.map(criterion => <span key={`${criterion.key}:${criterion.operator}`}>{criterionLabel(criterion)}<button aria-label={`Remove ${criterion.field} criterion`} onClick={() => setCriteria(current => current.filter(item => item !== criterion))}>×</button></span>)}</div><button className="add-alternative" onClick={() => onSetActiveGroup(group.id)}>Add alternative (OR)</button></div>)}</div>}
    <div className="bulk-actions"><button disabled={!browserResultsReady} onClick={() => setSelection(() => matchingMetricEntries.map(([name]) => name))}>Select filtered ({matchingMetricEntries.length})</button><button disabled={!browserResultsReady} onClick={() => setSelection(current => current.filter(name => !matchingMetricEntries.some(([match]) => match === name)))}>Unselect filtered</button><button onClick={() => setSelection(() => [])}>Clear</button></div>
    {!browserResultsReady ? <p className="empty">Preparing metric results…</p> : !matchingMetricEntries.length ? <p className="empty">No metrics match the current search and filters.</p> : <><div className="metric-pagination"><span>Showing {metricPage * METRICS_PER_PAGE + 1}–{Math.min((metricPage + 1) * METRICS_PER_PAGE, matchingMetricEntries.length)} of {matchingMetricEntries.length}</span><div><button disabled={metricPage === 0} onClick={() => onMetricPageChange(metricPage - 1)}>Previous</button><span>Page {metricPage + 1} of {pageCount}</span><button disabled={metricPage + 1 === pageCount} onClick={() => onMetricPageChange(metricPage + 1)}>Next</button></div></div><ul className="metric-list">{pageEntries.map(([name, observations]) => { const latest = observations.at(-1); const selected = selectedMetricNames.includes(name); const summary = catalogue.summary(name); return <li key={name}><div className={selected ? 'metric-list-item selected' : 'metric-list-item'}><button className="metric-select" aria-pressed={selected} onClick={() => toggleMetricSelection(name)}><strong>{name}</strong><span>{selected ? 'Chart selected · ' : ''}Latest: {latest.value} · {new Date(latest.timestamp).toLocaleString()}</span></button><div className="field-summary">{summary.map(({ path, value }) => { const item = catalogue.values(path).find(candidate => candidate.value === value); return <span key={`${path}:${value}`}>{path}={value}<button className="filter-in" aria-label={`Filter in ${path}=${value}`} onClick={event => { if (item) { onAddCriterion(path, value, item.key, 'equals'); flashFilterButton(event.currentTarget); } }}>+</button><button className="filter-out" aria-label={`Filter out ${path}=${value}`} onClick={event => { if (item) { onAddCriterion(path, value, item.key, 'notEquals'); flashFilterButton(event.currentTarget); } }}>−</button></span>; })}</div></div></li>; })}</ul></>}</section></div>;
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
  const [debouncedMetricQuery, setDebouncedMetricQuery] = useState('');
  const [metricPage, setMetricPage] = useState(0);
  const [selectedMetricNames, setSelectedMetricNames] = useState(() => loadSelectedMetrics().slice(0, DEFAULT_MAX_CHARTS));
  const [maxChartCount, setMaxChartCount] = useState(DEFAULT_MAX_CHARTS);
  const [criteria, setCriteria] = useState([]);
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [criterionField, setCriterionField] = useState('');
  const [criterionValueKey, setCriterionValueKey] = useState('');
  const [criterionText, setCriterionText] = useState('');
  const [criterionOperator, setCriterionOperator] = useState('equals');
  const [detailMetricName, setDetailMetricName] = useState(null);
  const [metricBrowserOpen, setMetricBrowserOpen] = useState(false);
  const [browserResultsReady, setBrowserResultsReady] = useState(false);
  const [criteriaRefreshTick, setCriteriaRefreshTick] = useState(0);
  const [chartNow, setChartNow] = useState(Date.now);
  const [status, setStatus] = useState({ state: 'disconnected', message: 'Configure a connector to begin.' });
  const [connectionInfo, setConnectionInfo] = useState({ ticket: 'Not requested', socket: 'Not opened', metrics: 'No live frames received yet.' });
  const socketRef = useRef(null); const retryRef = useRef(null); const ticketAbortRef = useRef(null); const metricSearchRef = useRef(null); const pendingMetricsRef = useRef([]); const metricFlushTimerRef = useRef(null); const nextCriterionGroupRef = useRef(1); const generationRef = useRef(0); const metricEntriesRef = useRef([]);
  const stopLive = useCallback(() => { generationRef.current += 1; if (retryRef.current) clearTimeout(retryRef.current); retryRef.current = null; if (ticketAbortRef.current) ticketAbortRef.current.abort(); ticketAbortRef.current = null; if (metricFlushTimerRef.current) clearTimeout(metricFlushTimerRef.current); metricFlushTimerRef.current = null; pendingMetricsRef.current = []; if (socketRef.current) { socketRef.current.close(1000, 'Connector stopped'); socketRef.current = null; } }, []);
  const flushMetrics = useCallback(() => { const metrics = pendingMetricsRef.current; pendingMetricsRef.current = []; metricFlushTimerRef.current = null; if (!metrics.length) return; metrics.forEach(metric => catalogueRef.current.add(metric.metricName, metric.raw)); setCatalogueBytes(catalogueRef.current.bytes); setSeries(current => addObservations(current, metrics)); setLatestMetrics(current => { const next = { ...current }; metrics.forEach(metric => { next[metric.metricName] = metric; }); return next; }); }, []);
  const receiveMetrics = useCallback(metrics => { pendingMetricsRef.current.push(...metrics); if (!metricFlushTimerRef.current) metricFlushTimerRef.current = setTimeout(flushMetrics, METRIC_RENDER_BATCH_MS); }, [flushMetrics]);
  useEffect(() => () => stopLive(), [stopLive]);
  useEffect(() => { const timer = setTimeout(() => setDebouncedMetricQuery(metricQuery.trim()), FILTER_DEBOUNCE_MS); return () => clearTimeout(timer); }, [metricQuery]);
  useEffect(() => { if (!metricBrowserOpen) { setBrowserResultsReady(false); return undefined; } metricSearchRef.current?.focus(); const timer = setTimeout(() => setBrowserResultsReady(true), 0); return () => clearTimeout(timer); }, [metricBrowserOpen]);
  useEffect(() => { if (!metricBrowserOpen) return undefined; const timer = setInterval(() => setCriteriaRefreshTick(current => current + 1), CRITERIA_REFRESH_MS); return () => clearInterval(timer); }, [metricBrowserOpen]);
  useEffect(() => { if (!selectedMetricNames.length) return undefined; setChartNow(Date.now()); const timer = setInterval(() => setChartNow(Date.now()), CHART_CLOCK_MS); return () => clearInterval(timer); }, [selectedMetricNames.length]);
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
  metricEntriesRef.current = metricEntries;
  const catalogue = catalogueRef.current;
  const catalogueFields = catalogue.fields().filter(field => field !== 'name');
  const criterionIsName = criterionField === '__name';
  const criterionIsValue = criterionField === '__value';
  const criterionValues = criterionField && !criterionIsName && !criterionIsValue ? catalogue.values(criterionField) : [];
  const criteriaGroups = useMemo(() => criteria.reduce((groups, criterion) => { const groupId = criterion.groupId; const group = groups.find(item => item.id === groupId); if (group) group.criteria.push(criterion); else groups.push({ id: groupId, criteria: [criterion] }); return groups; }, []), [criteria]);
  const criterionMatches = useCallback((name, observations, criterion) => {
    if (criterion.kind === 'metricName') return matchesNameCriteria(name, [criterion]);
    if (criterion.kind === 'metricValue') return matchesValueCriteria(observations.at(-1)?.value, [criterion]);
    if (criterion.operator === 'nonZero') return Number(observations.at(-1)?.value) !== 0;
    return catalogue.matches(name, '', [criterion]);
  }, [catalogue]);
  const matchingMetricEntries = useMemo(() => { void criteriaRefreshTick; return !browserResultsReady ? [] : metricEntriesRef.current.filter(([name, observations]) => (!debouncedMetricQuery || name.toLocaleLowerCase().includes(debouncedMetricQuery.toLocaleLowerCase())) && criteriaGroups.every(group => group.criteria.some(criterion => criterionMatches(name, observations, criterion)))); }, [browserResultsReady, criteriaGroups, criteriaRefreshTick, criterionMatches, debouncedMetricQuery]);
  const pageCount = Math.max(1, Math.ceil(matchingMetricEntries.length / METRICS_PER_PAGE));
  const pageEntries = matchingMetricEntries.slice(metricPage * METRICS_PER_PAGE, (metricPage + 1) * METRICS_PER_PAGE);
  const selectedMetricEntries = metricEntries.filter(([name]) => selectedMetricNames.includes(name));
  const selectedChartGroups = useMemo(() => groupMetricSeries(selectedMetricEntries), [selectedMetricEntries]);
  const setSelection = transform => setSelectedMetricNames(current => { const requested = [...new Set(transform(current))]; const next = requested.slice(0, maxChartCount); saveSelectedMetrics(next); return next; });
  const toggleMetricSelection = name => setSelection(current => current.includes(name) ? current.filter(selected => selected !== name) : [...current, name]);
  const addCriterion = (field, value, key, operator = 'equals', kind) => { if (!field || (!key && operator !== 'contains')) return; const groupId = activeGroupId || `group-${nextCriterionGroupRef.current++}`; setCriteria(current => current.some(criterion => criterion.groupId === groupId && criterion.field === field && criterion.key === key && criterion.operator === operator) ? current : [...current, { ...(kind ? { kind } : {}), field, value, key, operator, groupId }]); setActiveGroupId(null); setMetricPage(0); };
  const addBuiltCriterion = () => { if (criterionIsValue && criterionOperator === 'nonZero') { addNonZeroCriterion(); return; } if (criterionIsValue && Number.isFinite(Number(criterionText))) { addCriterion('value', Number(criterionText), `${criterionOperator}:${criterionText}`, criterionOperator, 'metricValue'); setCriterionText(''); return; } if ((criterionIsName || criterionOperator === 'contains') && criterionText.trim()) { const value = criterionText.trim(); addCriterion(criterionIsName ? 'name' : criterionField, value, `contains:${value}`, 'contains', criterionIsName ? 'metricName' : undefined); setCriterionText(''); return; } if (criterionValueKey.startsWith('manual:')) { addCriterion(criterionField, criterionText, criterionValueKey, criterionOperator); return; } const value = criterionValues.find(item => item.key === criterionValueKey); if (value) addCriterion(criterionField, value.value, value.key, criterionOperator); };
  const addNonZeroCriterion = () => { const groupId = activeGroupId || `group-${nextCriterionGroupRef.current++}`; setCriteria(current => current.some(criterion => criterion.operator === 'nonZero' && criterion.groupId === groupId) ? current : [...current, { field: 'value', value: 'non-zero', key: 'non-zero', operator: 'nonZero', groupId }]); setActiveGroupId(null); setMetricPage(0); };
  const criterionLabel = criterion => criterion.operator === 'nonZero' ? 'value ≠ 0' : criterion.kind === 'metricName' ? `name contains ${criterion.value}` : criterion.kind === 'metricValue' ? `value ${({ valueEquals: '=', valueNotEquals: '≠', valueGreaterThan: '>', valueGreaterThanOrEqual: '≥', valueLessThan: '<', valueLessThanOrEqual: '≤' })[criterion.operator]} ${criterion.value}` : `${criterion.field} ${criterion.operator === 'contains' ? 'contains' : criterion.operator === 'equals' ? '=' : '≠'} ${criterion.value}`;
  const chooseCriterionField = field => { setCriterionField(field); setCriterionValueKey(''); setCriterionText(''); setCriterionOperator(field === '__name' ? 'contains' : field === '__value' ? 'valueEquals' : 'equals'); };
  const chooseCriterionOperator = operator => { setCriterionOperator(operator); setCriterionValueKey(''); setCriterionText(''); };
  const chooseCriterionValue = (key, manualValue = '') => { setCriterionValueKey(key); setCriterionText(manualValue); };
  return <main><header><img src="logo.png" alt="Opscotch" /><div><h1>opscotch monitor</h1><p className={`status ${status.state}`}>{status.message}</p></div><button onClick={() => setShowSettings(value => !value)}>Connector settings</button></header>
    {showSettings && <form className="settings" onSubmit={save}><h2>Connector</h2><p>Connection settings are stored only in this browser’s local storage. The Metrics Store API receives the configured Authorization header and must return a short-lived browser WebSocket URL.</p>
      <label><input type="radio" checked={draft.activeConnector === 'polling'} onChange={() => setDraft(current => ({ ...current, activeConnector: 'polling' }))} /> Polling</label><input aria-label="Polling URL" type="url" placeholder="https://monitor.example" value={draft.polling.url} onChange={event => setDraft(current => ({ ...current, polling: { url: event.target.value } }))} />
      <label><input type="radio" checked={draft.activeConnector === 'metricsStore'} onChange={() => setDraft(current => ({ ...current, activeConnector: 'metricsStore' }))} /> Opscotch Metrics Store</label><input aria-label="Metrics Store API URL" type="url" placeholder="https://metrics-store.example/ticket" value={draft.metricsStore.apiUrl} onChange={event => updateMetricsStore('apiUrl', event.target.value)} /><input aria-label="Metrics Store Authorization" type="password" placeholder="Authorization (for example, Bearer v2.…)" value={draft.metricsStore.authorization} onChange={event => updateMetricsStore('authorization', event.target.value)} autoComplete="off" /><input aria-label="Metric names" placeholder="Metric names, comma separated (all if empty)" value={draft.metricsStore.metricNames} onChange={event => updateMetricsStore('metricNames', event.target.value)} /><input aria-label="Dimensions" placeholder="Dimensions: key=value, key=value (all if empty)" value={draft.metricsStore.dimensions} onChange={event => updateMetricsStore('dimensions', event.target.value)} /><div><button type="submit">Save and connect</button></div></form>}
    {config.activeConnector === 'metricsStore' && <section className="connection-details" aria-label="Live connection activity"><h2>Live connection activity</h2><dl><dt>Ticket exchange</dt><dd>{connectionInfo.ticket}</dd><dt>WebSocket</dt><dd>{connectionInfo.socket}</dd><dt>Metrics</dt><dd>{connectionInfo.metrics}</dd><dt>Metric catalogue</dt><dd>{formatBytes(catalogueBytes)} indexed</dd></dl></section>}
    {!metricEntries.length && <p className="empty">{status.state === 'connected' ? 'No matching metrics have arrived yet.' : 'No metric data to display.'}</p>}
    {!!metricEntries.length && <section className="metric-search" aria-label="Metric search"><label htmlFor="metric-search">Browse {metricEntries.length} metrics</label><input id="metric-search" ref={metricSearchRef} aria-label="Find a metric" type="search" placeholder="Find a metric" value={metricQuery} onFocus={() => setMetricBrowserOpen(true)} onChange={event => { setMetricQuery(event.target.value); setMetricPage(0); setMetricBrowserOpen(true); }} /><label className="chart-cap" htmlFor="chart-cap">Max charts <input id="chart-cap" aria-label="Maximum charts" type="number" min="1" value={maxChartCount} onChange={event => { const next = Math.max(1, Number(event.target.value) || 1); setMaxChartCount(next); setSelectedMetricNames(current => { const capped = current.slice(0, next); saveSelectedMetrics(capped); return capped; }); }} /></label><span>{selectedMetricNames.length} chart{selectedMetricNames.length === 1 ? '' : 's'} selected</span>{!!selectedMetricNames.length && <button className="clear-selection" onClick={() => setSelection(() => [])}>Clear</button>}</section>}
    {!!metricEntries.length && metricBrowserOpen && <div className="browser-panel-new"><MetricBrowserPanel activeGroupId={activeGroupId} addBuiltCriterion={addBuiltCriterion} addNonZeroCriterion={addNonZeroCriterion} browserResultsReady={browserResultsReady} catalogue={catalogue} catalogueFields={catalogueFields} criterionField={criterionField} criterionIsName={criterionIsName} criterionIsValue={criterionIsValue} criterionLabel={criterionLabel} criterionOperator={criterionOperator} criterionText={criterionText} criterionValueKey={criterionValueKey} criterionValues={criterionValues} criteriaGroups={criteriaGroups} debouncedMetricQuery={debouncedMetricQuery} matchingMetricEntries={matchingMetricEntries} metricEntries={metricEntries} metricPage={metricPage} onAddCriterion={addCriterion} onCancelGroup={() => setActiveGroupId(null)} onClose={() => setMetricBrowserOpen(false)} onCriterionFieldChange={chooseCriterionField} onCriterionOperatorChange={chooseCriterionOperator} onCriterionTextChange={setCriterionText} onCriterionValueChange={chooseCriterionValue} onMetricPageChange={setMetricPage} onQueryChange={value => { setMetricQuery(value); setMetricPage(0); }} onSetActiveGroup={setActiveGroupId} pageCount={pageCount} pageEntries={pageEntries} selectedMetricNames={selectedMetricNames} setCriteria={setCriteria} setSelection={setSelection} toggleMetricSelection={toggleMetricSelection} /></div>}
    {!!selectedChartGroups.length && <div className="deployment-groups">{selectedChartGroups.map(({ deploymentId, series: deploymentSeries }) => <section className="deployment-group" key={deploymentId}><h2>{deploymentId === NO_DEPLOYMENT_ID ? NO_DEPLOYMENT_ID : `Deployment: ${deploymentId}`}</h2><div className="charts">{deploymentSeries.map(([name, observations]) => <div key={name}><MetricChart metricName={name} observations={observations} index={selectedMetricNames.indexOf(name)} now={chartNow} /><button className="metric-body-button" aria-label={`View latest metric body for ${name}`} title="View latest metric body" onClick={() => setDetailMetricName(name)}>{'{}'}</button></div>)}</div></section>)}</div>}{detailMetricName && <MetricBodyModal metricName={detailMetricName} metric={latestMetrics[detailMetricName]} onAddCriterion={addCriterion} onClose={() => setDetailMetricName(null)} />}</main>;
}
