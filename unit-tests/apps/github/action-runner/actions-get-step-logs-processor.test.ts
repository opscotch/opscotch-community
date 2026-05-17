import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../../resources/apps/github/actions/actions-get-step-logs-processor.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('github/action-runner actions-get-step-logs-processor', () => {
  it('slices by timestamp, removes runner control lines, and returns step_log_lines with ms offsets', async () => {
    const logs = [
      '2026-05-17T01:00:00Z ##[group]Run Build Agent',
      '2026-05-17T01:00:01.000Z \u001b[36;1mcompile started\u001b[0m',
      '2026-05-17T01:00:02.500Z Error: compilation failed',
      '2026-05-17T01:00:03Z ##[error]Process completed with exit code 2.',
      '2026-05-17T01:00:04Z ##[group]Run post-failure diagnostics',
      '2026-05-17T01:00:05Z should not be included',
    ].join('\n');

    const context = createJavascriptContext({
      body: JSON.stringify({
        repo: 'opscotch/builder',
        run_id: 123,
        job_id: 456,
        step_name: 'Build Agent',
        step_number: 14,
        step_started_at: '2026-05-17T01:00:01Z',
        step_completed_at: '2026-05-17T01:00:03Z',
        log_fetch_deployment_access_id: 'openclaw-pr-actions-build-state',
        log_fetch_step_id: 'fetch-run-log-content',
      }),
      sendToStep: (call) => {
        if (call.stepName === 'github-action-get-job-logs') {
          return { body: JSON.stringify({ redirect_location: 'https://example/logs.zip' }) };
        }
        if (call.deploymentAccessId === 'openclaw-pr-actions-build-state' && call.stepName === 'fetch-run-log-content') {
          return { body: JSON.stringify({ logs }) };
        }
        return { body: '{}' };
      },
    });

    await suite.run("resource", { context });
    const out = JSON.parse(context.getBody() || '{}');

    expect(out.status).toBe('ok');
    expect(out.operation).toBe('get-step-logs');
    expect(out.logs_redirect_url).toBe('https://example/logs.zip');
    expect(out.synthetic_summary).toBe('Process completed with exit code 2.');
    expect(out.exit_code).toBe(2);
    expect(Array.isArray(out.step_log_lines)).toBe(true);
    expect(out.step_log_lines).toEqual([
      { log: 'compile started', line_number: 1, milliseconds_since_first_true_log: 0 },
      { log: 'Error: compilation failed', line_number: 2, milliseconds_since_first_true_log: 1500 },
    ]);
  });

  it('falls back to marker text when timestamp parsing cannot slice a window', async () => {
    const logs = [
      'Run Build Agent',
      'plain line without timestamp',
      'another plain line',
    ].join('\n');

    const context = createJavascriptContext({
      body: JSON.stringify({
        repo: 'opscotch/builder',
        run_id: 124,
        job_id: 457,
        step_name: 'Build Agent',
        step_number: 15,
        step_started_at: 'not-a-date',
        step_completed_at: 'not-a-date',
        log_fetch_deployment_access_id: 'openclaw-pr-actions-build-state',
        log_fetch_step_id: 'fetch-run-log-content',
      }),
      sendToStep: (call) => {
        if (call.stepName === 'github-action-get-job-logs') {
          return { body: JSON.stringify({ redirect_location: 'https://example/logs.zip' }) };
        }
        if (call.deploymentAccessId === 'openclaw-pr-actions-build-state' && call.stepName === 'fetch-run-log-content') {
          return { body: JSON.stringify({ logs }) };
        }
        return { body: '{}' };
      },
    });

    await suite.run("resource", { context });
    const out = JSON.parse(context.getBody() || '{}');
    expect(out.step_log_lines).toEqual([
      { log: 'plain line without timestamp', line_number: 1, milliseconds_since_first_true_log: 0 },
      { log: 'another plain line', line_number: 2, milliseconds_since_first_true_log: 0 },
    ]);
    expect(out.synthetic_summary).toBe('');
    expect(out.exit_code).toBe(null);
  });
});
