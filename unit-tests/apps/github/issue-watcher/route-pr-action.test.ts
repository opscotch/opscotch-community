import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../../resources/apps/github/route-pr-action.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

function routeContext(actionResponseBody: unknown) {
  return createJavascriptContext({
    body: JSON.stringify({
      repo: 'opscotch/hopscotch',
      issue_number: 451,
      pull_number: 451,
      pull_url: 'https://github.com/opscotch/hopscotch/pull/451',
      pull_context: { number: 451, head: { ref: 'feature/pr-451' } },
      entity_type: 'pr',
      labels: ['ready for dev'],
      matched_label: 'ready for dev',
      action_deployment_id: 'openclaw-pr-actions',
      action_step_id: 'dispatch-bmad-pr-develop',
      updated_at: '2026-05-11T02:37:20Z',
      title: 'Apply review feedback',
      issue_body: 'PR body',
      issue_context: { number: 451 },
    }),
    data: { issueWatcherDecisionLoggingEnabled: true },
    sendToStep: (call) => {
      if (call.stepName === 'fetch-issue-comments') {
        return { body: JSON.stringify({ status: 'ok', comments: [{ id: 1, body: 'Needs another test.' }] }) };
      }
      return { body: typeof actionResponseBody === 'string' ? actionResponseBody : JSON.stringify(actionResponseBody) };
    },
  });
}

describe('route-pr-action', () => {
  it('routes PR payload only after downstream dispatch explicitly queues it', async () => {
    const context = routeContext({ queued: true, status: 'ok' });

    await suite.run("resource", { context });

    expect(context.__sendToStepCalls).toHaveLength(3);
    expect(context.__sendToStepCalls[0].stepName).toBe('fetch-issue-comments');
    expect(JSON.parse(context.__sendToStepCalls[0].body || '{}')).toEqual({
      repo: 'opscotch/hopscotch',
      issue: 451,
      entity_type: 'issue',
      pull_number: 451,
    });
    expect(context.__sendToStepCalls[1].stepName).toBe('fetch-issue-comments');
    expect(JSON.parse(context.__sendToStepCalls[1].body || '{}')).toEqual({
      repo: 'opscotch/hopscotch',
      issue: 451,
      entity_type: 'pr',
      pull_number: 451,
    });
    expect(context.__sendToStepCalls[2].deploymentAccessId).toBe('openclaw-pr-actions');
    expect(context.__sendToStepCalls[2].stepName).toBe('dispatch-bmad-pr-develop');
    expect(JSON.parse(context.__sendToStepCalls[2].body || '{}')).toMatchObject({
      matched_label: 'ready for dev',
      repo: 'opscotch/hopscotch',
      issue: 451,
      pull_number: 451,
      entity_type: 'pr',
      comments: [{ id: 1, body: 'Needs another test.' }],
      action_deployment_id: 'openclaw-pr-actions',
      action_step_id: 'dispatch-bmad-pr-develop',
    });
    expect(JSON.parse(context.getBody() || '{}')).toMatchObject({
      routed: true,
      action_deployment_id: 'openclaw-pr-actions',
      action_step_id: 'dispatch-bmad-pr-develop',
      repo: 'opscotch/hopscotch',
      issue: 451,
      pull_number: 451,
    });
  });

  it('does not acknowledge stopped PR dispatch responses', async () => {
    const context = routeContext({});

    await suite.run("resource", { context });

    expect(JSON.parse(context.getBody() || '{}')).toMatchObject({
      routed: false,
      action_deployment_id: 'openclaw-pr-actions',
      action_step_id: 'dispatch-bmad-pr-develop',
      repo: 'opscotch/hopscotch',
      issue: 451,
      pull_number: 451,
      error: 'downstream-dispatch-not-acknowledged',
      response: {},
    });
  });
});
