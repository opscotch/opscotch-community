import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(
  import.meta.dirname,
  '../../../apps/opscotch-ai-developer/opscotch/resources/dispatch-run-build.js',
);

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

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

    await suite.run("resource", { context });

    const out = JSON.parse(context.getBody() || '{}');
    expect(out).toMatchObject({
      status: 'error',
      queued: false,
      operation: 'run-build',
      source_branch: 'feature/pr-451',
      error: { code: 'testrunner_branch_missing' },
    });
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
        if (call.stepName === 'github-action-trigger') {
          return { body: JSON.stringify({ run_id: 998877, html_url: 'https://github.com/opscotch/builder/actions/runs/998877' }) };
        }
        if (call.stepName === 'compute-pr-labels') {
          return { body: JSON.stringify({ status: 'ok', labels: ['in progress'] }) };
        }
        return { body: JSON.stringify({ status: 'ok' }) };
      },
    });

    await suite.run("resource", { context });

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

  it.each([
    ['public', 'app-release.yml'],
    ['private', 'private-oapp-release.yml'],
  ])('dispatches %s app packaging through the documented builder workflow', async (visibility, workflowId) => {
    const context = createJavascriptContext({
      timestamp: Date.parse('2026-09-11T00:00:00Z'),
      body: JSON.stringify({
        repo: 'opscotch/opscotch-apps-source',
        pull_number: 453,
        matched_label: 'run build',
        issue_context: { labels: [{ name: 'run build' }], updated_at: '2026-09-11T00:00:00Z' },
      }),
      data: { issueUpdaterDeploymentAccessId: 'github-issue-updater-callers-pr', issueUpdaterStepId: 'github-issue-updater' },
      sendToStep: (call) => {
        if (call.stepName === 'github-pr-get-details') {
          return { body: JSON.stringify({ body: `app: sample-app\nversion: 1.15\nvisibility: ${visibility}` }) };
        }
        if (call.stepName === 'github-action-trigger') {
          return { body: JSON.stringify({ run_id: 998878, html_url: 'https://github.com/opscotch/builder/actions/runs/998878' }) };
        }
        if (call.stepName === 'compute-pr-labels') return { body: JSON.stringify({ status: 'ok', labels: ['in progress'] }) };
        return { body: JSON.stringify({ status: 'ok' }) };
      },
    });

    await suite.run('resource', { context });

    const trigger = context.__sendToStepCalls.find((call) => call.stepName === 'github-action-trigger');
    expect(JSON.parse(trigger?.body || '{}')).toMatchObject({
      operation: 'trigger-and-resolve-workflow-run', repo: 'opscotch/builder', ref: 'main', workflow_id: workflowId,
      inputs: { release_tag: 'sample-app-1.15', isLatest: false, isPreRelease: true },
    });
    expect(JSON.parse(trigger?.body || '{}').inputs).toEqual({ release_tag: 'sample-app-1.15', isLatest: false, isPreRelease: true });
    const queued = context.__sendToStepAndForgetCalls.find((call) => call.stepName === 'process-run-build-tracking-queue');
    expect(JSON.parse(queued?.body || '{}')).toMatchObject({ app: 'sample-app', version: '1.15', visibility, release_tag: 'sample-app-1.15', workflow_id: workflowId });
  });

  it('restores pr review without dispatching when app packaging directives are invalid', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({ repo: 'opscotch/opscotch-apps-source', pull_number: 454, issue_context: { labels: [{ name: 'run build' }] } }),
      data: { issueUpdaterDeploymentAccessId: 'github-issue-updater-callers-pr', issueUpdaterStepId: 'github-issue-updater' },
      sendToStep: (call) => {
        if (call.stepName === 'github-pr-get-details') return { body: JSON.stringify({ body: 'app: sample-app\nversion: bad/version\nvisibility: internal' }) };
        return { body: JSON.stringify({ status: 'ok' }) };
      },
    });

    await suite.run('resource', { context });

    expect(context.__sendToStepCalls.some((call) => call.stepName === 'github-action-trigger')).toBe(false);
    expect(context.__sendToStepAndForgetCalls.some((call) => call.stepName === 'process-run-build-tracking-queue')).toBe(false);
    expect(JSON.parse(context.getBody() || '{}')).toMatchObject({ status: 'error', queued: false, error: { code: 'version_directive_invalid' } });
    const recovery = context.__sendToStepCalls.find((call) => call.stepName === 'consume-ai-action-trigger');
    expect(recovery).toBeTruthy();
  });

  it('does not queue or persist an app build when run resolution fails', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({ repo: 'opscotch/opscotch-apps-source', pull_number: 455, issue_context: { labels: [{ name: 'run build' }] } }),
      data: { issueUpdaterDeploymentAccessId: 'github-issue-updater-callers-pr', issueUpdaterStepId: 'github-issue-updater' },
      sendToStep: (call) => {
        if (call.stepName === 'github-pr-get-details') return { body: JSON.stringify({ body: 'app: sample-app\nversion: 1.15\nvisibility: private' }) };
        if (call.stepName === 'github-action-trigger') return { body: JSON.stringify({ status: 'error', errors: [{ message: 'workflow unavailable' }] }) };
        return { body: JSON.stringify({ status: 'ok' }) };
      },
    });

    await suite.run('resource', { context });

    expect(context.__sendToStepAndForgetCalls.some((call) => call.stepName === 'process-run-build-tracking-queue')).toBe(false);
    expect(JSON.parse(context.getBody() || '{}')).toMatchObject({ status: 'error', queued: false, error: { code: 'run_resolution_failed' } });
  });
});
