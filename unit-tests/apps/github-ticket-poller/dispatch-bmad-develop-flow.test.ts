import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resourcesRoot = path.resolve(import.meta.dirname, '../../../../opscotch-apps-source/opscotch-ai-developer/opscotch/resources');
const flowResource = path.join(resourcesRoot, 'dispatch-bmad-develop.js');
const invokeResource = path.join(resourcesRoot, 'dispatch-bmad-develop-invoke.js');

const suite = createResourceSuite({
  resources: [
    { id: 'flow', resource: flowResource },
    { id: 'invoke', resource: invokeResource },
  ],
});

describe('github-ticket-poller/dispatch-bmad-develop', () => {
  it('orchestrates prepare, start comment, and async invoke then returns accepted invoke body', async () => {
    const input = { repo: 'opscotch/hopscotch', issue: 328 };
    const prepared = {
      ...input,
      request_id: 'req-1',
      workflow: 'implementation-planning',
      base_branch: '3.1.4',
      work_branch: 'opscotch/issue-328-develop',
      ai: {
        provider: 'codex',
        model: 'gpt-5.4-mini',
        reasoning_effort: 'medium',
        verbosity: 'low',
      },
      payload: {
        updated_at: '2026-05-07T00:00:00Z',
        title: 'Issue title',
        issue_body: 'Issue body',
        comments: [],
        issue_context: {
          labels: [{ name: 'ready for dev' }, { name: 'bug' }, { name: 'in progress' }],
        },
        matched_label: 'ready for dev',
        model: 'codex',
      },
    };
    const started = { ...prepared, start_comment_written: true };
    const accepted = { queued: true, status: 'ok', operation: 'develop', request_id: 'req-1' };
    const context = createJavascriptContext({
      body: JSON.stringify(input),
      sendToStep: (call) => {
        if (call.stepName === 'dispatch-bmad-develop-prepare') return { body: JSON.stringify(prepared) };
        if (call.stepName === 'dispatch-bmad-develop-start-comment') return { body: JSON.stringify(started) };
        if (call.stepName === 'dispatch-bmad-develop-invoke') return { body: JSON.stringify(accepted) };
        return { body: '{}' };
      },
    });

    await suite.run('flow', { context });

    expect(context.__sendToStepCalls.map((call) => call.stepName)).toEqual([
      'dispatch-bmad-develop-prepare',
      'dispatch-bmad-develop-start-comment',
      'dispatch-bmad-develop-invoke',
    ]);
    expect(JSON.parse(context.__sendToStepCalls[1].body || '{}')).toEqual(prepared);
    expect(JSON.parse(context.__sendToStepCalls[2].body || '{}')).toEqual(started);
    expect(JSON.parse(context.getBody() || '{}')).toEqual(accepted);
  });
});

describe('github-ticket-poller/dispatch-bmad-develop-invoke', () => {
  it('persists pending state and returns ok for async callback completion', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        repo: 'opscotch/hopscotch',
        issue: 339,
        request_id: 'req-1',
        idempotency_key: 'idem-1',
        queue_idempotency_key: 'idem-queue',
        run_id: 'run-1',
        started_at: '2026-05-07T00:00:00.000Z',
        workflow: 'implementation-planning',
        base_branch: '3.1.4',
        work_branch: 'opscotch/issue-339-develop',
        instructions: 'Ship it',
        ai: {
          provider: 'codex',
          model: 'gpt-5.4-mini',
          reasoning_effort: 'medium',
          verbosity: 'low',
        },
        updater_deployment_access_id: 'github-issue-updater-callers',
        updater_step_id: 'github-issue-updater',
        payload: {
          updated_at: '2026-05-07T00:00:00Z',
          title: 'Issue title',
          issue_body: 'Issue body',
          comments: [{ body: 'LGTM' }],
          issue_context: {
            labels: [{ name: 'ready for dev' }, { name: 'bug' }, { name: 'in progress' }],
          },
          matched_label: 'ready for dev',
          model: 'codex',
        },
      }),
      sendToStep: (call) => {
        if (call.stepName === 'invoke-cli-sidecar-developer') {
          return { body: JSON.stringify({ queued: true, status: 'ok', request_id: 'req-1' }) };
        }
        if (call.deploymentAccessId === 'github-issue-updater-callers' && call.stepName === 'github-issue-updater') {
          return { body: JSON.stringify({ status: 'ok' }) };
        }
        return { body: JSON.stringify({ status: 'ok' }) };
      },
    });

    await suite.run('invoke', { context });

    const out = JSON.parse(context.getBody() || '{}');
    expect(out).toMatchObject({
      queued: true,
      status: 'ok',
      operation: 'develop',
      request_id: 'req-1',
      run_id: 'run-1',
    });

    const pending = JSON.parse(context.getPersistedItem('pending:req-1') || '{}');
    expect(pending).toMatchObject({
      repo: 'opscotch/hopscotch',
      issue: 339,
      request_id: 'req-1',
      run_id: 'run-1',
    });
  });
});
