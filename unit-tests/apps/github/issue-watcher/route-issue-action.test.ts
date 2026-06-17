import path from 'node:path';

import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

import { buildContextFixture, expectSendToStep, getDataJson } from './fixtures/index.js';
import { triageAssigned } from './fixtures/scenarios.js';

const resource = path.resolve(import.meta.dirname, '../../../../resources/apps/github/route-issue-action.js');

const suite = createResourceSuite({
  resources: [{ id: 'resource', resource }],
});

function routeContext(actionResponseBody: unknown) {
  return createJavascriptContext(
    triageAssigned.buildRouteContext({
      sendToStep: (call) => {
        if (call.stepName === 'fetch-issue-comments') {
          return { body: JSON.stringify({ status: 'ok', comments: [{ id: 1, body: 'comment' }] }) };
        }
        return { body: typeof actionResponseBody === 'string' ? actionResponseBody : JSON.stringify(actionResponseBody) };
      },
    }),
  );
}

describe('route-issue-action', () => {
  it('routes issue payload only after downstream dispatch explicitly queues it', async () => {
    const context = routeContext({ queued: true, status: 'ok' });

    await suite.run('resource', { context });

    expect(getDataJson<boolean>(context, 'issueWatcherDecisionLoggingEnabled', false)).toBe(true);
    expectSendToStep(context, [
      {
        stepName: 'fetch-issue-comments',
        body: {
          repo: triageAssigned.criterion.repo,
          issue: triageAssigned.issue.number,
          entity_type: 'issue',
          pull_number: triageAssigned.issue.number,
        },
      },
      {
        deploymentAccessId: triageAssigned.criterion.deploymentId,
        stepName: triageAssigned.criterion.stepId,
        body: {
          matched_label: triageAssigned.criterion.label,
          repo: triageAssigned.criterion.repo,
          issue: triageAssigned.issue.number,
          issue_body: triageAssigned.issue.body,
          comments: [{ id: 1, body: 'comment' }],
          action_deployment_id: triageAssigned.criterion.deploymentId,
          action_step_id: triageAssigned.criterion.stepId,
        },
      },
    ]);
    expect(JSON.parse(context.getBody() || '{}')).toEqual({
      routed: true,
      action_deployment_id: triageAssigned.criterion.deploymentId,
      action_step_id: triageAssigned.criterion.stepId,
      matched_label: triageAssigned.criterion.label,
      repo: triageAssigned.criterion.repo,
      issue: triageAssigned.issue.number,
    });
  });

  it('does not acknowledge a stopped downstream dispatch that returns an empty body', async () => {
    const context = routeContext('');

    await suite.run('resource', { context });

    expect(JSON.parse(context.getBody() || '{}')).toMatchObject({
      routed: false,
      action_deployment_id: triageAssigned.criterion.deploymentId,
      action_step_id: triageAssigned.criterion.stepId,
      repo: triageAssigned.criterion.repo,
      issue: triageAssigned.issue.number,
      error: 'downstream-dispatch-failed',
      response: null,
    });
  });

  it('does not acknowledge downstream dispatch without an explicit acceptance marker', async () => {
    const context = routeContext({});

    await suite.run('resource', { context });

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

    await suite.run('resource', { context });

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
    await expect(suite.run('resource', { context })).rejects.toThrow(
      `Invalid JSON body from ${triageAssigned.criterion.stepId}`,
    );
  });

  it('buildContextFixture keeps string bodies unchanged for route tests', () => {
    expect(buildContextFixture({ body: '' }).body).toBe('');
  });
});
