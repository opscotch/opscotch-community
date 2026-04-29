import path from 'node:path';
import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../../resources/apps/github/route-ticket-action.js');

describe('route-ticket-action', () => {
  it('routes triage label to remote dispatch-bmad-refine', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        repo: 'opscotch/hopscotch',
        issue_number: 317,
        labels: ['triage'],
        issue_url: 'https://github.com/opscotch/hopscotch/issues/317',
        title: 'Refine this',
        issue_body: 'Issue body text',
        issue_context: {
          number: 317,
          body: 'Issue body text',
          comments: 4,
        },
        matched_label: 'triage',
        action_deployment_id: 'openclaw-ticket-actions',
        action_step_id: 'dispatch-bmad-refine',
      }),
    });

    await runResource({ resource, context });

    expect(context.__sendToStepCalls).toHaveLength(2);
    expect(context.__sendToStepCalls[0].stepName).toBe('fetch-issue-comments');
    expect(JSON.parse(context.__sendToStepCalls[0].body || '{}')).toEqual({
      repo: 'opscotch/hopscotch',
      issue: 317,
    });
    expect(context.__sendToStepCalls[1].deploymentAccessId).toBe('openclaw-ticket-actions');
    expect(context.__sendToStepCalls[1].stepName).toBe('dispatch-bmad-refine');
    const sent = JSON.parse(context.__sendToStepCalls[1].body || '{}');
    expect(sent).toMatchObject({
      operation: 'refine',
      workflow: 'quick-spec',
      model: 'minimax',
      repo: 'opscotch/hopscotch',
      issue: 317,
      reason: 'criteria-match:triage',
      issue_body: 'Issue body text',
      issue_context: {
        number: 317,
        body: 'Issue body text',
        comments: 4,
      },
    });
    expect(JSON.parse(context.getBody() || '{}')).toEqual({
      routed: true,
      action_deployment_id: 'openclaw-ticket-actions',
      action_step_id: 'dispatch-bmad-refine',
      operation: 'refine',
      repo: 'opscotch/hopscotch',
      issue: 317,
    });
  });

  it('routes dev review label to refine with implementation-planning and codex-mini', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        repo: 'opscotch/hopscotch',
        issue_number: 328,
        labels: ['dev review'],
        matched_label: 'dev review',
        action_deployment_id: 'openclaw-ticket-actions',
        action_step_id: 'dispatch-bmad-refine',
      }),
    });

    await runResource({ resource, context });

    expect(context.__sendToStepCalls).toHaveLength(2);
    expect(context.__sendToStepCalls[0].stepName).toBe('fetch-issue-comments');
    expect(context.__sendToStepCalls[1].deploymentAccessId).toBe('openclaw-ticket-actions');
    expect(context.__sendToStepCalls[1].stepName).toBe('dispatch-bmad-refine');
    expect(JSON.parse(context.__sendToStepCalls[1].body || '{}')).toMatchObject({
      operation: 'refine',
      workflow: 'implementation-planning',
      model: 'codex-mini',
      repo: 'opscotch/hopscotch',
      issue: 328,
      reason: 'criteria-match:dev review',
    });
  });

  it('routes read for dev label to develop with implementation-planning and codex', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        repo: 'opscotch/hopscotch',
        issue_number: 329,
        labels: ['read for dev'],
        matched_label: 'read for dev',
        issue_context: {
          user: {
            login: 'jscottnz',
          },
        },
        action_deployment_id: 'openclaw-ticket-actions',
        action_step_id: 'dispatch-bmad-develop',
      }),
      sendToStep: (call) => {
        if (call.stepName === 'fetch-issue-comments') {
          return {
            body: JSON.stringify({
              status: 'ok',
              comments: [
                { user: { login: 'jscottnz' }, body: 'Looks good, please implement now.' },
              ],
            }),
          };
        }
        return { body: JSON.stringify({ queued: true, status: 'ok' }) };
      },
    });

    await runResource({ resource, context });

    expect(context.__sendToStepCalls).toHaveLength(2);
    expect(context.__sendToStepCalls[0].stepName).toBe('fetch-issue-comments');
    expect(context.__sendToStepCalls[1].deploymentAccessId).toBe('openclaw-ticket-actions');
    expect(context.__sendToStepCalls[1].stepName).toBe('dispatch-bmad-develop');
    expect(JSON.parse(context.__sendToStepCalls[1].body || '{}')).toMatchObject({
      operation: 'develop',
      workflow: 'implementation-planning',
      model: 'codex',
      repo: 'opscotch/hopscotch',
      issue: 329,
      reason: 'criteria-match:read for dev',
    });
  });

  it('blocks read for dev routing when issue author approval is missing', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        repo: 'opscotch/hopscotch',
        issue_number: 330,
        labels: ['read for dev'],
        matched_label: 'read for dev',
        issue_context: {
          user: {
            login: 'jscottnz',
          },
        },
        action_deployment_id: 'openclaw-ticket-actions',
        action_step_id: 'dispatch-bmad-develop',
      }),
      sendToStep: (call) => {
        if (call.stepName === 'fetch-issue-comments') {
          return {
            body: JSON.stringify({
              status: 'ok',
              comments: [
                { user: { login: 'jscottnz' }, body: 'Please hold for now.' },
              ],
            }),
          };
        }
        return { body: JSON.stringify({ queued: true, status: 'ok' }) };
      },
    });

    await runResource({ resource, context });

    expect(context.__sendToStepCalls).toHaveLength(1);
    expect(context.__sendToStepCalls[0].stepName).toBe('fetch-issue-comments');
    expect(JSON.parse(context.getBody() || '{}')).toMatchObject({
      routed: false,
      operation: 'develop',
      repo: 'opscotch/hopscotch',
      issue: 330,
      error: 'author-approval-required',
    });
  });

  it('routes non-triage labels to remote dispatch-non-triage', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        repo: 'opscotch/hopscotch',
        issue_number: 318,
        labels: ['dev-ready'],
        matched_label: 'dev-ready',
        action_deployment_id: 'openclaw-ticket-actions',
        action_step_id: 'dispatch-non-triage',
      }),
    });

    await runResource({ resource, context });

    expect(context.__sendToStepCalls).toHaveLength(2);
    expect(context.__sendToStepCalls[0].stepName).toBe('fetch-issue-comments');
    expect(context.__sendToStepCalls[1].deploymentAccessId).toBe('openclaw-ticket-actions');
    expect(context.__sendToStepCalls[1].stepName).toBe('dispatch-non-triage');
    expect(JSON.parse(context.__sendToStepCalls[1].body || '{}')).toMatchObject({
      operation: 'dev-ready',
      repo: 'opscotch/hopscotch',
      issue: 318,
      action_deployment_id: 'openclaw-ticket-actions',
      action_step_id: 'dispatch-non-triage',
    });
    expect(JSON.parse(context.getBody() || '{}')).toEqual({
      routed: true,
      action_deployment_id: 'openclaw-ticket-actions',
      action_step_id: 'dispatch-non-triage',
      operation: 'dev-ready',
      repo: 'opscotch/hopscotch',
      issue: 318,
    });
  });
});
