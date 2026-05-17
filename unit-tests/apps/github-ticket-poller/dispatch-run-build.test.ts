import path from 'node:path';
import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = '/workspace/dev_workspace/al.machino/implementation-artifacts/opscotch/github-ticket-poller/resources/dispatch-run-build.js';

describe('github-ticket-poller/dispatch-run-build', () => {
  it('requires testrunnerbranch in PR body and comments on PR when missing', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        repo: 'opscotch/hopscotch',
        pull_number: 451,
      }),
      sendToStep: (call) => {
        if (call.stepName === 'github-pr-get-details') {
          return { body: JSON.stringify({ body: 'no branch marker here', head_branch: 'feature/pr-451' }) };
        }
        if (call.deploymentAccessId === 'github-issue-updater') {
          return { body: JSON.stringify({ status: 'ok' }) };
        }
        return { body: '{}' };
      },
    });

    await expect(runResource({ resource, context })).rejects.toThrow('testrunnerbranch is required in PR body');

    expect(context.__sendToStepCalls.some((c) => c.deploymentAccessId === 'github-issue-updater' && c.stepName === 'github-issue-updater')).toBe(true);
  });

  it('dispatches build, resolves run_id, and enqueues tracker', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        repo: 'opscotch/hopscotch',
        pull_number: 452,
      }),
      sendToStep: (call) => {
        if (call.stepName === 'github-pr-get-details') {
          return { body: JSON.stringify({ body: 'testrunnerbranch: feature/test-runner', head_branch: 'feature/pr-452' }) };
        }
        if (call.stepName === 'invoke-builder-build-action') {
          return { body: JSON.stringify({ status: 'ok', operation: 'trigger-workflow' }) };
        }
        if (call.stepName === 'github-action-trigger-only') {
          return { body: JSON.stringify({ run_id: 998877, html_url: 'https://github.com/opscotch/builder/actions/runs/998877' }) };
        }
        return { body: '{}' };
      },
    });

    await runResource({ resource, context });

    const out = JSON.parse(context.getBody() || '{}');
    expect(out).toMatchObject({
      status: 'ok',
      queued: true,
      run_id: 998877,
      source_branch: 'feature/pr-452',
      testrunner_branch: 'feature/test-runner',
    });

    const queued = context.__sendToStepAndForgetCalls.find((c) => c.stepName === 'process-run-build-tracking-queue');
    expect(queued).toBeTruthy();
    expect(JSON.parse(queued?.body || '{}')).toMatchObject({
      run_id: 998877,
      repo: 'opscotch/hopscotch',
      pull_number: 452,
    });
  });
});
