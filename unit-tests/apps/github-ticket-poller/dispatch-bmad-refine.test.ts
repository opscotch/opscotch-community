import { existsSync } from 'node:fs';
import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const mountedResource = '/workspace/dev_workspace/al.machino/implementation-artifacts/opscotch/github-ticket-poller/resources/dispatch-bmad-refine.js';
const localResource = '/home/jeremy/dev/opscotch/dev_workspace/al.machino/implementation-artifacts/opscotch/github-ticket-poller/resources/dispatch-bmad-refine.js';
const resource = existsSync(mountedResource) ? mountedResource : localResource;

describe('github-ticket-poller/dispatch-bmad-refine', () => {
  it('comments and reassigns to issue author when base_branch is missing', async () => {
    const context = createJavascriptContext({
      data: {
        issueUpdaterDeploymentAccessId: 'github-issue-updater-callers',
        issueUpdaterAddCommentStepId: 'github-issue-add-comment',
        issueUpdaterUpdateIssueStepId: 'github-issue-update',
        issueUpdaterDeleteCommentStepId: 'github-issue-delete-comment',
        actionInstructionsByRepoLabel: {
          'opscotch/hopscotch': {
            triage: ['Refine into an implementation-ready brief'],
          },
        },
        refineWorkflow: 'quick-spec',
        refineModel: 'minimax',
      },
      body: JSON.stringify({
        repo: 'opscotch/hopscotch',
        issue: 345,
        updated_at: '2026-05-14T23:36:28Z',
        title: 'Issue title',
        issue_body: 'Issue body without base_branch marker',
        comments: [],
        issue_context: {
          user: { login: 'jscottnz' },
        },
        matched_label: 'triage',
      }),
      sendToStep: (call) => {
        if (call.stepName === 'extract-base-branch') {
          return { body: JSON.stringify({ base_branch: '' }) };
        }
        if (call.deploymentAccessId === 'github-issue-updater-callers') {
          return { body: JSON.stringify({ status: 'ok', response: { id: 1 } }) };
        }
        return { body: JSON.stringify({ status: 'ok' }) };
      },
    });

    await runResource({ resource, context });

    const out = JSON.parse(context.getBody() || '{}');
    expect(out).toMatchObject({
      queued: false,
      status: 'error',
      operation: 'refine',
      issue: 345,
      error: {
        code: 'missing_base_branch',
      },
    });

    const updateCall = context.__sendToStepCalls.find(
      (c) => c.deploymentAccessId === 'github-issue-updater-callers' && c.stepName === 'github-issue-update',
    );
    expect(updateCall).toBeTruthy();
    expect(JSON.parse(updateCall?.body || '{}')).toMatchObject({
      repo: 'opscotch/hopscotch',
      issue: 345,
      assignees: ['jscottnz'],
    });
  });
});
