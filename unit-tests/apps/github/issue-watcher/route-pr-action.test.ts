import path from 'node:path';

import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

import { expectSendToStep, getDataJson } from './fixtures/index.js';
import { prReadyForDev } from './fixtures/scenarios.js';

const resource = path.resolve(import.meta.dirname, '../../../../resources/apps/github/route-pr-action.js');

const suite = createResourceSuite({
  resources: [{ id: 'resource', resource }],
});

function routeContext(actionResponseBody: unknown) {
  return createJavascriptContext({
    ...prReadyForDev.buildRouteContext({
      sendToStep: (call) => {
        if (call.stepName === 'fetch-issue-comments') {
          return { body: JSON.stringify({ status: 'ok', comments: [{ id: 1, body: 'Needs another test.' }] }) };
        }
        return { body: typeof actionResponseBody === 'string' ? actionResponseBody : JSON.stringify(actionResponseBody) };
      },
    }),
  });
}

describe('route-pr-action', () => {
  it('routes PR payload only after downstream dispatch explicitly queues it', async () => {
    const context = routeContext({ queued: true, status: 'ok' });

    await suite.run('resource', { context });

    expect(getDataJson<boolean>(context, 'issueWatcherDecisionLoggingEnabled', false)).toBe(true);
    expectSendToStep(context, [
      {
        stepName: 'fetch-issue-comments',
        body: {
          repo: prReadyForDev.criterion.repo,
          issue: prReadyForDev.issue.number,
          entity_type: 'issue',
          pull_number: prReadyForDev.issue.number,
        },
      },
      {
        stepName: 'fetch-issue-comments',
        body: {
          repo: prReadyForDev.criterion.repo,
          issue: prReadyForDev.issue.number,
          entity_type: 'pr',
          pull_number: prReadyForDev.issue.number,
        },
      },
      {
        deploymentAccessId: prReadyForDev.criterion.deploymentId,
        stepName: prReadyForDev.criterion.stepId,
        body: {
          matched_label: prReadyForDev.criterion.label,
          repo: prReadyForDev.criterion.repo,
          issue: prReadyForDev.issue.number,
          pull_number: prReadyForDev.issue.number,
          entity_type: 'pr',
          comments: [{ id: 1, body: 'Needs another test.' }],
          action_deployment_id: prReadyForDev.criterion.deploymentId,
          action_step_id: prReadyForDev.criterion.stepId,
        },
      },
    ]);
    expect(JSON.parse(context.getBody() || '{}')).toMatchObject({
      routed: true,
      action_deployment_id: prReadyForDev.criterion.deploymentId,
      action_step_id: prReadyForDev.criterion.stepId,
      repo: prReadyForDev.criterion.repo,
      issue: prReadyForDev.issue.number,
      pull_number: prReadyForDev.issue.number,
    });
  });

  it('does not acknowledge stopped PR dispatch responses', async () => {
    const context = routeContext({});

    await suite.run('resource', { context });

    expect(JSON.parse(context.getBody() || '{}')).toMatchObject({
      routed: false,
      action_deployment_id: prReadyForDev.criterion.deploymentId,
      action_step_id: prReadyForDev.criterion.stepId,
      repo: prReadyForDev.criterion.repo,
      issue: prReadyForDev.issue.number,
      pull_number: prReadyForDev.issue.number,
      error: 'downstream-dispatch-not-acknowledged',
      response: {},
    });
  });
});
