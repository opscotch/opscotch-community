import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../../resources/apps/github/actions/actions-trigger-and-resolve-run.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('github/action-runner actions-trigger-and-resolve-run', () => {
  it('triggers workflow and resolves new run id', async () => {
    const fixedTs = Date.now();
    const context = createJavascriptContext({
      timestamp: fixedTs,
      data: { hostId: 'github-api' },
      body: JSON.stringify({
        operation: 'trigger-and-resolve-workflow-run',
        repo: 'opscotch/hopscotch',
        workflow_id: 'ci.yml',
        ref: 'main',
      }),
      sendToStep: (call) => {
        if (call.stepName === 'github-action-list-runs') {
          // First call returns only old runs (before trigger)
          // Subsequent calls return new run with recent timestamp
          const triggerCalls = context.__sendToStepCalls?.filter(c => c.stepName === 'github-action-trigger-only') || [];
          if (triggerCalls.length === 0) {
            // First list call - before trigger, return old run only
            return { body: JSON.stringify({ runs: [{ id: 100, run_number: 10, status: 'completed', created_at: new Date(fixedTs - 60000).toISOString() }] }) };
          }
          // Polling calls - return old + new run
          return { body: JSON.stringify({ runs: [{ id: 100, run_number: 10, status: 'completed', created_at: new Date(fixedTs - 60000).toISOString() }, { id: 101, run_number: 11, status: 'queued', created_at: new Date(fixedTs).toISOString() }] }) };
        }
        if (call.stepName === 'github-action-trigger') {
          return { body: JSON.stringify({}) };
        }
        return { body: '{}' };
      },
    });

    await suite.run("resource", { context });

    const out = JSON.parse(context.getBody() || '{}');
    expect(out.status).toBe('ok');
    expect(out.operation).toBe('trigger-and-resolve-workflow-run');
    expect(out.repo).toBe('opscotch/hopscotch');
    expect(out.workflow_id).toBe('ci.yml');
    expect(out.run_id).toBe(101);
    expect(out.run_number).toBe(11);
    expect(out.polls_used).toBe(1);
  });

  it('selects latest run when multiple new runs exist', async () => {
    const fixedTs = Date.now();
    const context = createJavascriptContext({
      timestamp: fixedTs,
      data: { hostId: 'github-api' },
      body: JSON.stringify({
        operation: 'trigger-and-resolve-workflow-run',
        repo: 'opscotch/hopscotch',
        workflow_id: 'ci.yml',
        ref: 'main',
      }),
      sendToStep: (call) => {
        if (call.stepName === 'github-action-list-runs') {
          const triggerCalls = context.__sendToStepCalls?.filter(c => c.stepName === 'github-action-trigger-only') || [];
          if (triggerCalls.length === 0) {
            // Before trigger
            return { body: JSON.stringify({ runs: [{ id: 98, run_number: 9, status: 'completed', created_at: new Date(fixedTs - 120000).toISOString() }] }) };
          }
          // After trigger - multiple runs with different timestamps
          return { body: JSON.stringify({ 
            runs: [
              { id: 98, run_number: 9, status: 'completed', created_at: new Date(fixedTs - 120000).toISOString() },
              { id: 100, run_number: 11, status: 'completed', conclusion: 'failure', created_at: new Date(fixedTs - 30000).toISOString() },
              { id: 101, run_number: 12, status: 'in_progress', created_at: new Date(fixedTs).toISOString() }
            ]
          }) };
        }
        if (call.stepName === 'github-action-trigger') {
          return { body: JSON.stringify({}) };
        }
        return { body: '{}' };
      },
    });

    await suite.run("resource", { context });

    const out = JSON.parse(context.getBody() || '{}');
    // Should pick run 101 (newest with created_at = fixedTs)
    expect(out.run_id).toBe(101);
    expect(out.run_number).toBe(12);
  });

  it('returns dispatch errors without polling for a run', async () => {
    const context = createJavascriptContext({
      timestamp: Date.now(),
      data: { hostId: 'github-api' },
      body: JSON.stringify({
        operation: 'trigger-and-resolve-workflow-run',
        repo: 'opscotch/builder',
        workflow_id: 'multistage-build.yml',
        ref: 'main',
      }),
      sendToStep: (call) => {
        if (call.stepName === 'github-action-list-runs') {
          return { body: JSON.stringify({ runs: [] }) };
        }
        if (call.stepName === 'github-action-trigger-only') {
          return { body: JSON.stringify({ status: 'error', status_code: '422', response: 'Invalid workflow input', errors: [{ message: 'Unexpected input: buildagents' }] }) };
        }
        return { body: '{}' };
      },
    });

    await suite.run('resource', { context });

    const out = JSON.parse(context.getBody() || '{}');
    expect(out).toMatchObject({
      status: 'error',
      operation: 'trigger-and-resolve-workflow-run',
      repo: 'opscotch/builder',
      workflow_id: 'multistage-build.yml',
      polls_used: 0,
      trigger_response: { status_code: '422', response: 'Invalid workflow input' },
    });
    expect(context.__sendToStepCalls.filter((call) => call.stepName === 'github-action-list-runs')).toHaveLength(1);
  });

  // TODO: Skipped - test runner doesn't implement schema validation yet
  // The inSchema marks fields as required but testkit runs .run() directly
  // without pre-validation, so code proceeds to polling logic instead of failing early
  it.skip('throws when repo is not in owner/repo format', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        repo: 'invalid',
        workflow_id: 'ci.yml',
        ref: 'main',
      }),
    });

    await suite.run("resource", { context });

    expect(context.__error).toContain('owner/repo format');
  });

  it.skip('throws when workflow_id is missing', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        repo: 'opscotch/hopscotch',
        ref: 'main',
      }),
    });

    await suite.run("resource", { context });

    expect(context.__error).toContain('workflow_id is required');
  });

  it.skip('throws when ref is missing', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        repo: 'opscotch/hopscotch',
        workflow_id: 'ci.yml',
      }),
    });

    await suite.run("resource", { context });

    expect(context.__error).toContain('ref is required');
  });
});
