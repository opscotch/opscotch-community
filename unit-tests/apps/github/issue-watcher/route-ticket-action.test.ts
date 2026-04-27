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

    expect(context.__sendToStepCalls).toHaveLength(1);
    expect(context.__sendToStepCalls[0].deploymentAccessId).toBe('openclaw-ticket-actions');
    expect(context.__sendToStepCalls[0].stepName).toBe('dispatch-bmad-refine');
    const sent = JSON.parse(context.__sendToStepCalls[0].body || '{}');
    expect(sent).toMatchObject({
      operation: 'refine',
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

    expect(context.__sendToStepCalls).toHaveLength(1);
    expect(context.__sendToStepCalls[0].deploymentAccessId).toBe('openclaw-ticket-actions');
    expect(context.__sendToStepCalls[0].stepName).toBe('dispatch-non-triage');
    expect(JSON.parse(context.__sendToStepCalls[0].body || '{}')).toMatchObject({
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
