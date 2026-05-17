import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../../resources/apps/github/route-issue-action.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

function baseBody(overrides = {}) {
  return {
    repo: 'opscotch/hopscotch',
    issue_number: 343,
    entity_type: 'issue',
    labels: ['triage'],
    matched_label: 'triage',
    action_deployment_id: 'openclaw-ticket-actions',
    action_step_id: 'dispatch-bmad-refine-triage',
    updated_at: '2026-05-11T02:37:20Z',
    issue_url: 'https://github.com/opscotch/hopscotch/issues/343',
    title: 'Refine this',
    issue_body: 'Issue body text',
    issue_context: { number: 343, body: 'Issue body text' },
    ...overrides,
  };
}

function routeContext(actionResponseBody: unknown) {
  return createJavascriptContext({
    body: JSON.stringify(baseBody()),
    data: { issueWatcherDecisionLoggingEnabled: true },
    sendToStep: (call) => {
      if (call.stepName === 'fetch-issue-comments') {
        return { body: JSON.stringify({ status: 'ok', comments: [{ id: 1, body: 'comment' }] }) };
      }
      return { body: typeof actionResponseBody === 'string' ? actionResponseBody : JSON.stringify(actionResponseBody) };
    },
  });
}

describe('route-issue-action', () => {
  it('routes issue payload only after downstream dispatch explicitly queues it', async () => {
    const context = routeContext({ queued: true, status: 'ok' });

    await suite.run("resource", { context });

    expect(context.__sendToStepCalls).toHaveLength(2);
    expect(context.__sendToStepCalls[0].stepName).toBe('fetch-issue-comments');
    expect(JSON.parse(context.__sendToStepCalls[0].body || '{}')).toEqual({
      repo: 'opscotch/hopscotch',
      issue: 343,
      entity_type: 'issue',
      pull_number: 343,
    });
    expect(context.__sendToStepCalls[1].deploymentAccessId).toBe('openclaw-ticket-actions');
    expect(context.__sendToStepCalls[1].stepName).toBe('dispatch-bmad-refine-triage');
    expect(JSON.parse(context.__sendToStepCalls[1].body || '{}')).toMatchObject({
      matched_label: 'triage',
      repo: 'opscotch/hopscotch',
      issue: 343,
      issue_body: 'Issue body text',
      comments: [{ id: 1, body: 'comment' }],
      action_deployment_id: 'openclaw-ticket-actions',
      action_step_id: 'dispatch-bmad-refine-triage',
    });
    expect(JSON.parse(context.getBody() || '{}')).toEqual({
      routed: true,
      action_deployment_id: 'openclaw-ticket-actions',
      action_step_id: 'dispatch-bmad-refine-triage',
      matched_label: 'triage',
      repo: 'opscotch/hopscotch',
      issue: 343,
    });
  });

  it('does not acknowledge a stopped downstream dispatch that returns an empty body', async () => {
    const context = routeContext('');

    await suite.run("resource", { context });

    expect(JSON.parse(context.getBody() || '{}')).toMatchObject({
      routed: false,
      action_deployment_id: 'openclaw-ticket-actions',
      action_step_id: 'dispatch-bmad-refine-triage',
      repo: 'opscotch/hopscotch',
      issue: 343,
      error: 'downstream-dispatch-failed',
      response: null,
    });
  });

  it('does not acknowledge downstream dispatch without an explicit acceptance marker', async () => {
    const context = routeContext({});

    await suite.run("resource", { context });

    expect(JSON.parse(context.getBody() || '{}')).toMatchObject({
      routed: false,
      error: 'downstream-dispatch-not-acknowledged',
      response: {},
    });
  });

  it('preserves rate-limited downstream responses so the poller can stop the tick', async () => {
    const context = routeContext({
      queued: false,
      error: { code: 'rate_limited', message: 'OpenClaw invoke already in progress', retryable: true },
    });

    await suite.run("resource", { context });

    expect(JSON.parse(context.getBody() || '{}')).toMatchObject({
      routed: false,
      error: 'downstream-dispatch-failed',
      response: {
        queued: false,
        error: { code: 'rate_limited', retryable: true },
      },
    });
  });

  it('throws when downstream dispatch returns a non-JSON token body', async () => {
    const context = routeContext('queued');
    await expect(suite.run("resource", { context })).rejects.toThrow('Invalid JSON body from dispatch-bmad-refine-triage');
  });
});
