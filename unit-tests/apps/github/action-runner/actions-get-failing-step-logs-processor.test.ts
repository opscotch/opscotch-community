import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../../resources/apps/github/actions/actions-get-failing-step-logs-processor.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('github/action-runner actions-get-failing-step-logs-processor', () => {
  it('resolves failing step metadata and delegates to get-step-logs', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        repo: 'opscotch/builder',
        run_id: 999,
        log_fetch_deployment_access_id: 'openclaw-pr-actions-build-state',
        log_fetch_step_id: 'fetch-run-log-content',
      }),
      sendToStep: (call) => {
        if (call.stepName === 'github-action-get-failing-step') {
          return {
            body: JSON.stringify({
              job_id: 111,
              job_name: 'tests / build',
              failing_step_name: 'Build Agent',
              failing_step_number: 14,
              failing_step_started_at: '2026-05-17T01:00:00Z',
              failing_step_completed_at: '2026-05-17T01:02:00Z',
            }),
          };
        }
        if (call.stepName === 'github-action-get-step-logs') {
          const payload = JSON.parse(call.body || '{}');
          expect(payload).toMatchObject({
            repo: 'opscotch/builder',
            run_id: 999,
            job_id: 111,
            step_name: 'Build Agent',
            log_fetch_deployment_access_id: 'openclaw-pr-actions-build-state',
            log_fetch_step_id: 'fetch-run-log-content',
          });
          return {
            body: JSON.stringify({
              step_log_lines: [{ log: 'line-1', line_number: 1, milliseconds_since_first_true_log: 0 }],
              synthetic_summary: 'Process completed with exit code 2.',
              exit_code: 2,
            }),
          };
        }
        return { body: '{}' };
      },
    });

    await suite.run("resource", { context });
    const out = JSON.parse(context.getBody() || '{}');

    expect(out).toMatchObject({
      status: 'ok',
      operation: 'get-failing-step-logs',
      repo: 'opscotch/builder',
      run_id: 999,
      failing_step: {
        job_id: 111,
        job_name: 'tests / build',
        step_name: 'Build Agent',
        step_number: 14,
      },
      synthetic_summary: 'Process completed with exit code 2.',
      exit_code: 2,
    });
    expect(out.step_log_lines).toEqual([{ log: 'line-1', line_number: 1, milliseconds_since_first_true_log: 0 }]);
  });
});

