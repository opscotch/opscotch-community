import path from 'node:path';

import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

import { buildContextFixture, expectSendToStep, getDataJson } from './fixtures/index.js';
import { devReviewAssigned, prReadyForDev, triageAssigned } from './fixtures/scenarios.js';

const resource = path.resolve(import.meta.dirname, '../../../../resources/apps/github/poll-results-processor.js');

const suite = createResourceSuite({
  resources: [{ id: 'resource', resource }],
});

describe('poll-results-processor', () => {
  it.each([
    {
      name: 'triageAssigned',
      scenario: triageAssigned,
      expectedStepId: 'dispatch-bmad-refine-triage',
    },
    {
      name: 'devReviewAssigned',
      scenario: devReviewAssigned,
      expectedStepId: 'dispatch-non-triage',
    },
  ])('dispatches $name issue and updates watermark', async ({ scenario, expectedStepId }) => {
    const ignoredIssue = {
      number: 999,
      title: 'Ignore me',
      html_url: 'https://github.com/opscotch/hopscotch/issues/999',
      updated_at: '2026-04-24T01:12:00Z',
      labels: [{ name: scenario.criterion.label }],
      assignees: [{ login: 'someone-else' }],
    };

    const context = createJavascriptContext(
      buildContextFixture({
        ...scenario.buildPollContext(),
        body: [scenario.issue, ignoredIssue],
        sendToStep: (call) => {
          if (call.stepName === 'route-ticket-action') {
            return { body: JSON.stringify({ routed: true }) };
          }
          return { body: '{}' };
        },
      }),
    );

    await suite.run('resource', { context });

    expect(getDataJson<Array<Record<string, unknown>>>(context, 'githubIssueWatcherCriteria', [])).toHaveLength(1);
    expectSendToStep(context, [
      {
        stepName: 'route-ticket-action',
        body: {
          repo: scenario.criterion.repo,
          issue_number: scenario.issue.number,
          assignee: scenario.criterion.assignee,
          labels: [scenario.criterion.label],
          issue_body: scenario.issue.body,
          matched_label: scenario.criterion.label,
          action_deployment_id: scenario.criterion.deploymentId,
          action_step_id: expectedStepId,
        },
      },
    ]);
    expect(context.getPersistedItem('issueUpdatedAtByNumber')).toContain(scenario.issue.updated_at);
    expect(JSON.parse(context.getBody() || '{}')).toEqual({
      status: 'ok',
      scanned_issues: 2,
      dispatched_actions: 1,
    });
  });

  it('does not redispatch unchanged watermark', async () => {
    const issues = [
      {
        number: 317,
        labels: [{ name: 'triage' }],
        assignees: [{ login: 'machinoal2-cell' }],
        updated_at: '2026-04-23T00:00:00Z',
      },
    ];

    const context = createJavascriptContext(
      triageAssigned.buildPollContext({
        body: issues,
        persistedItems: {
          issueUpdatedAtByNumber: JSON.stringify({ 'issue:317': '2026-04-23T00:00:00Z' }),
        },
      }),
    );

    await suite.run('resource', { context });

    expect(context.__sendToStepCalls).toHaveLength(0);
    expect(JSON.parse(context.getBody() || '{}')).toEqual({
      status: 'ok',
      scanned_issues: 1,
      dispatched_actions: 0,
    });
  });

  it('stops the current poll tick when downstream OpenClaw dispatch is rate limited', async () => {
    const issues = [
      {
        number: 317,
        body: 'First issue',
        labels: [{ name: 'triage' }],
        assignees: [{ login: 'machinoal2-cell' }],
        updated_at: '2026-04-23T00:00:00Z',
        title: 'Busy',
      },
      {
        number: 318,
        body: 'Second issue',
        labels: [{ name: 'triage' }],
        assignees: [{ login: 'machinoal2-cell' }],
        updated_at: '2026-04-23T00:00:01Z',
        title: 'Should wait',
      },
    ];

    const context = createJavascriptContext(
      triageAssigned.buildPollContext({
        body: issues,
        sendToStep: (call) => {
          if (call.stepName === 'route-ticket-action') {
            return {
              body: JSON.stringify({
                routed: false,
                response: {
                  error: {
                    code: 'rate_limited',
                    message: 'OpenClaw invoke already in progress',
                    retryable: true,
                  },
                },
              }),
            };
          }
          return { body: '{}' };
        },
      }),
    );

    await suite.run('resource', { context });

    expect(context.__sendToStepCalls).toHaveLength(1);
    expect(JSON.parse(context.getPersistedItem('issueUpdatedAtByNumber') || '{}')).toEqual({});
    expect(JSON.parse(context.getBody() || '{}')).toEqual({
      status: 'ok',
      scanned_issues: 1,
      dispatched_actions: 0,
    });
  });

  it('does not watermark when route response is marked routed but also contains an error', async () => {
    const issues = [
      {
        number: 343,
        body: 'Missing base branch',
        labels: [{ name: 'triage' }],
        assignees: [{ login: 'machinoal2-cell' }],
        updated_at: '2026-05-11T02:37:20Z',
        title: 'Should retry after dispatch failure',
      },
    ];

    const context = createJavascriptContext(
      triageAssigned.buildPollContext({
        body: issues,
        sendToStep: (call) => {
          if (call.stepName === 'route-ticket-action') {
            return {
              body: JSON.stringify({
                routed: true,
                error: 'downstream-dispatch-failed',
                response: {},
              }),
            };
          }
          return { body: '{}' };
        },
      }),
    );

    await suite.run('resource', { context });

    expect(context.__sendToStepCalls).toHaveLength(1);
    expect(JSON.parse(context.getPersistedItem('issueUpdatedAtByNumber') || '{}')).toEqual({});
    expect(JSON.parse(context.getBody() || '{}')).toEqual({
      status: 'ok',
      scanned_issues: 1,
      dispatched_actions: 0,
    });
  });

  it('waits for configured handoff delay before dispatching', async () => {
    const issues = [
      {
        number: 319,
        body: 'Recently updated issue',
        labels: [{ name: 'triage' }],
        assignees: [{ login: 'machinoal2-cell' }],
        updated_at: '2026-04-23T00:01:00Z',
        html_url: 'https://github.com/opscotch/hopscotch/issues/319',
        title: 'Wait before handing off',
      },
    ];

    const context = createJavascriptContext(
      triageAssigned.buildPollContext({
        body: issues,
        data: {
          githubIssueWatcherCriteria: [
            {
              ...triageAssigned.criterion,
              deploymentId: 'openclaw-ticket-actions',
              stepId: 'dispatch-bmad-refine',
            },
          ],
          issueHandoffDelaySeconds: 120,
        },
        timestamp: Date.parse('2026-04-23T00:02:00Z'),
      }),
    );

    await suite.run('resource', { context });

    expect(context.__sendToStepCalls).toHaveLength(0);
    expect(context.getPersistedItem('issueUpdatedAtByNumber')).toBe('{}');
    expect(JSON.parse(context.getBody() || '{}')).toEqual({
      status: 'ok',
      scanned_issues: 1,
      dispatched_actions: 0,
    });
  });

  it('dispatches only pull requests when watchEntity is pr and uses pr watermark keys', async () => {
    const mixed = [
      {
        number: 401,
        labels: [{ name: 'ready for dev' }],
        assignees: [{ login: 'machinoal2-cell' }],
        updated_at: '2026-04-23T00:05:00Z',
        html_url: 'https://github.com/opscotch/hopscotch/issues/401',
        title: 'Issue should be ignored in pr mode',
      },
      {
        number: 402,
        pull_request: {
          html_url: 'https://github.com/opscotch/hopscotch/pull/402',
        },
        body: 'PR follow-up body',
        labels: [{ name: 'ready for dev' }],
        assignees: [{ login: 'machinoal2-cell' }],
        updated_at: '2026-04-23T00:06:00Z',
        html_url: 'https://github.com/opscotch/hopscotch/pull/402',
        title: 'PR should dispatch',
      },
    ];

    const context = createJavascriptContext(
      prReadyForDev.buildPollContext({
        body: mixed,
        sendToStep: (call) => {
          if (call.stepName === 'route-ticket-action') {
            return { body: JSON.stringify({ routed: true }) };
          }
          return { body: '{}' };
        },
      }),
    );

    await suite.run('resource', { context });

    expectSendToStep(context, [
      {
        stepName: 'route-ticket-action',
        body: {
          entity_type: 'pr',
          issue_number: 402,
          pull_number: 402,
          pull_url: 'https://github.com/opscotch/hopscotch/pull/402',
          matched_label: 'ready for dev',
          action_deployment_id: 'openclaw-pr-actions',
          action_step_id: 'dispatch-bmad-pr-develop',
        },
      },
    ]);
    expect(JSON.parse(context.getPersistedItem('issueUpdatedAtByNumber') || '{}')).toMatchObject({
      'pr:402': '2026-04-23T00:06:00Z',
    });
  });
});
