import path from 'node:path';
import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const prepareResource = '/workspace/dev_workspace/al.machino/implementation-artifacts/opscotch/github-ticket-poller/resources/dispatch-bmad-develop-prepare.js';
const flowResource = '/workspace/dev_workspace/al.machino/implementation-artifacts/opscotch/github-ticket-poller/resources/dispatch-bmad-develop.js';
const invokeResource = '/workspace/dev_workspace/al.machino/implementation-artifacts/opscotch/github-ticket-poller/resources/dispatch-bmad-develop-invoke.js';

describe('github-ticket-poller/dispatch-bmad-develop-prepare', () => {
  it('derives workflow/model/work_branch from step data for issue dispatch', async () => {
    const context = createJavascriptContext({
      data: {
        issueUpdaterDeploymentAccessId: 'github-issue-updater-callers',
        issueUpdaterStepId: 'github-issue-updater',
        actionInstructionsByRepoLabel: {
          'opscotch/hopscotch': {
            'ready for dev': ['Implement the requested change'],
          },
        },
        openclawDeveloperBaseBranch: 'main',
        developWorkflow: 'implementation-planning',
        developModel: 'codex',
        developWorkBranchPrefix: 'openclaw/issue-',
      },
      body: JSON.stringify({
        repo: 'opscotch/hopscotch',
        issue: 123,
        updated_at: '2026-05-09T00:00:00Z',
        title: 'Add feature',
        issue_body: 'Please add feature',
        comments: [],
        issue_context: { labels: [{ name: 'ready for dev' }] },
        matched_label: 'ready for dev',
        entity_type: 'issue',
      }),
      sendToStep: (call) => {
        if (call.stepName === 'extract-base-branch') {
          return { body: JSON.stringify({ base_branch: 'main' }) };
        }
        return { body: JSON.stringify({ status: 'ok' }) };
      },
    });

    await runResource({ resource: prepareResource, context });

    const out = JSON.parse(context.getBody() || '{}');
    expect(out.workflow).toBe('implementation-planning');
    expect(out.model).toBe('codex');
    expect(out.base_branch).toBe('main');
    expect(out.work_branch).toContain('openclaw/issue-123');
    expect(out.payload.workflow).toBe('implementation-planning');
    expect(out.payload.model).toBe('codex');
    expect(out.payload.work_branch).toContain('openclaw/issue-123');
    expect(out.instructions).toBe('Implement the requested change. ');
  });
});

describe('github-ticket-poller/dispatch-bmad-develop', () => {
  it('fails fast when prepare returns error and does not call downstream develop steps', async () => {
    const context = createJavascriptContext({
      data: {
        issueUpdaterDeploymentAccessId: 'github-issue-updater-callers',
        issueUpdaterStepId: 'github-issue-updater',
      },
      body: JSON.stringify({
        repo: 'opscotch/hopscotch',
        issue: 456,
      }),
      sendToStep: (call) => {
        if (call.stepName === 'dispatch-bmad-develop-prepare') {
          return { body: JSON.stringify({ status: 'error', error: { message: 'prepare failed' } }) };
        }
        return { body: JSON.stringify({ status: 'ok' }) };
      },
    });

    await expect(runResource({ resource: flowResource, context })).rejects.toThrow('dispatch-bmad-develop-prepare returned error');

    const calledSteps = context.__sendToStepCalls.map((c) => c.stepName);
    expect(calledSteps).toContain('dispatch-bmad-develop-prepare');
    expect(calledSteps).not.toContain('dispatch-bmad-develop-start-comment');
    expect(calledSteps).not.toContain('dispatch-bmad-develop-invoke');
    expect(calledSteps).not.toContain('dispatch-bmad-develop-finalize');
    expect(context.__sendToStepCalls.some((c) => c.deploymentAccessId === 'github-issue-updater-callers' && c.stepName === 'github-issue-updater')).toBe(true);
  });
});

describe('github-ticket-poller/dispatch-bmad-develop-invoke', () => {
  it('persists pending state and returns accepted for async callback completion', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        repo: 'opscotch/hopscotch',
        issue: 789,
        request_id: 'req-789',
        idempotency_key: 'opscotch/hopscotch:789:2026-05-09T00:00:00Z',
        queue_idempotency_key: 'opscotch/hopscotch:789:2026-05-09T00:00:00Z:develop',
        run_id: 'run-789',
        started_at: '2026-05-09T00:00:01Z',
        base_branch: 'main',
        work_branch: 'openclaw/issue-789',
        instructions: 'Implement change. ',
        payload: {
          updated_at: '2026-05-09T00:00:00Z',
          title: 'Title',
          issue_body: 'Body',
          model: 'codex',
        },
      }),
      sendToStep: (call) => {
        if (call.stepName === 'invoke-openclaw-developer') {
          return { body: JSON.stringify({ queued: true, status: 'accepted', request_id: 'req-789' }) };
        }
        return { body: JSON.stringify({ status: 'ok' }) };
      },
    });

    await runResource({ resource: invokeResource, context });

    const out = JSON.parse(context.getBody() || '{}');
    expect(out).toMatchObject({
      queued: true,
      status: 'accepted',
      request_id: 'req-789',
      run_id: 'run-789',
    });

    const pending = JSON.parse(context.getPersistedItem('pending:req-789') || '{}');
    expect(pending).toMatchObject({
      repo: 'opscotch/hopscotch',
      issue: 789,
      request_id: 'req-789',
      run_id: 'run-789',
    });
  });
});
