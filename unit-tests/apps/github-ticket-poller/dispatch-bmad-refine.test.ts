import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(
  import.meta.dirname,
  '../../../../opscotch-apps-source/opscotch-ai-developer/opscotch/resources/dispatch-bmad-refine.js',
);

const suite = createResourceSuite({
  resources: [{ id: 'resource', resource }],
});

function baseInput() {
  return {
    repo: 'opscotch/hopscotch',
    issue: '328',
    updated_at: '2026-04-28T01:36:28Z',
    title: 'Issue title',
    issue_body: 'Issue body',
    comments: [
      { user: { login: 'machinoal2-cell' }, body: 'internal' },
      { user: { login: 'jscottnz' }, body: 'base_branch=release/3.1' },
    ],
    issue_context: {
      updated_at: '2026-04-28T01:36:28Z',
      user: { login: 'jscottnz' },
      labels: [{ name: 'dev review' }, { name: 'bug' }],
    },
    matched_label: 'dev review',
    reason: 'matched',
  };
}

function baseData() {
  return {
    omitCommentUsers: ['machinoal2-cell'],
    issueUpdaterDeploymentAccessId: 'github-issue-updater',
    issueUpdaterAddCommentStepId: 'github-issue-add-comment',
    issueUpdaterUpdateIssueStepId: 'github-issue-update',
    issueUpdaterDeleteCommentStepId: 'github-issue-delete-comment',
    refineWorkflow: 'implementation-planning',
    actionInstructionsByRepoLabel: {
      'opscotch/hopscotch': {
        'dev review': {
          instructions: ['Refine this into an implementation plan'],
          ai: {
            provider: 'codex',
            model: 'gpt-5.6-luna',
            reasoningEffort: 'high',
            verbosity: 'medium',
          },
        },
      },
    },
  };
}

describe('dispatch-bmad-refine', () => {
  it('prepares strict refine state, writes start comment, and delegates invoke asynchronously', async () => {
    const invokeAccepted = { queued: true, status: 'ok', operation: 'refine', request_id: 'req-from-state' };
    const context = createJavascriptContext({
      timestamp: Date.parse('2026-04-28T01:40:43.000Z'),
      body: JSON.stringify(baseInput()),
      data: baseData(),
      sendToStep: (call) => {
        if (call.stepName === 'extract-base-branch') {
          return { body: JSON.stringify({ status: 'ok', base_branch: 'release/3.1', source: 'comments' }) };
        }
        if (call.deploymentAccessId === 'github-issue-updater' && call.stepName === 'github-issue-add-comment') {
          return { body: JSON.stringify({ status: 'ok', response: { id: 12345 } }) };
        }
        if (call.stepName === 'dispatch-bmad-refine-invoke') {
          return { body: JSON.stringify(invokeAccepted) };
        }
        return { body: '{}' };
      },
    });

    await suite.run('resource', { context });

    expect(context.__sendToStepCalls.map((call) => call.stepName)).toEqual([
      'extract-base-branch',
      'github-issue-add-comment',
      'dispatch-bmad-refine-invoke',
    ]);

    const extractPayload = JSON.parse(context.__sendToStepCalls[0].body || '{}');
    expect(extractPayload.comments).toEqual([{ user: { login: 'jscottnz' }, body: 'base_branch=release/3.1' }]);

    const startCommentPayload = JSON.parse(context.__sendToStepCalls[1].body || '{}');
    expect(startCommentPayload.comment).toContain('Refinement started by CLI sidecar reviewer (implementation-planning / gpt-5.6-luna).');
    expect(startCommentPayload.comment).toContain('- workflow: implementation-planning');
    expect(startCommentPayload.comment).toContain('- provider: codex');

    const state = JSON.parse(context.__sendToStepCalls[2].body || '{}');
    expect(state).toMatchObject({
      operation: 'refine',
      repo: 'opscotch/hopscotch',
      issue: 328,
      workflow: 'implementation-planning',
      ai: {
        provider: 'codex',
        model: 'gpt-5.6-luna',
        reasoning_effort: 'high',
        verbosity: 'medium',
      },
      base_branch: 'release/3.1',
      matched_label: 'dev review',
      start_comment_id: 12345,
      payload: {
        title: 'Issue title',
        issue_body: 'Issue body',
        comments: [{ user: { login: 'jscottnz' }, body: 'base_branch=release/3.1' }],
        instructions: 'Refine this into an implementation plan. ',
      },
    });
    expect(state.request_id).toMatch(/[0-9a-f-]{36}/);
    expect(state.idempotency_key).toBe('opscotch/hopscotch:328:2026-04-28T01:36:28Z');
    expect(JSON.parse(context.getBody() || '{}')).toEqual(invokeAccepted);
  });
});
