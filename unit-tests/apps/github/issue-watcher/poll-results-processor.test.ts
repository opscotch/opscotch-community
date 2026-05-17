import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../../resources/apps/github/poll-results-processor.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('poll-results-processor', () => {
  it('dispatches matching issue and updates watermark', async () => {
    const issues = [
      {
        number: 317,
        body: 'Please refine acceptance criteria',
        labels: [{ name: 'triage' }],
        assignees: [{ login: 'machinoal2-cell' }],
        updated_at: '2026-04-23T00:00:00Z',
        html_url: 'https://github.com/opscotch/hopscotch/issues/317',
        title: 'Refine me',
      },
      {
        number: 318,
        labels: [{ name: 'triage' }],
        assignees: [{ login: 'someone-else' }],
        updated_at: '2026-04-23T00:00:01Z',
        html_url: 'https://github.com/opscotch/hopscotch/issues/318',
        title: 'Ignore me',
      },
    ];

    const context = createJavascriptContext({
      body: JSON.stringify(issues),
      data: {
        'githubIssueWatcherCriteria': [
          {
            label: 'triage',
            assignee: 'machinoal2-cell',
            repo: 'opscotch/hopscotch',
            deploymentId: 'openclaw-ticket-actions',
            stepId: 'dispatch-bmad-refine',
          },
        ],
      },
      sendToStep: (call) => {
        if (call.stepName === 'route-ticket-action') {
          return { body: JSON.stringify({ routed: true }) };
        }
        return { body: '{}' };
      },
    });

    await suite.run("resource", { context });

    expect(context.__sendToStepCalls).toHaveLength(1);
    expect(context.__sendToStepCalls[0].stepName).toBe('route-ticket-action');
    const sent = JSON.parse(context.__sendToStepCalls[0].body || '{}');
    expect(sent).toMatchObject({
      repo: 'opscotch/hopscotch',
      issue_number: 317,
      assignee: 'machinoal2-cell',
      labels: ['triage'],
      issue_body: 'Please refine acceptance criteria',
      matched_label: 'triage',
      action_deployment_id: 'openclaw-ticket-actions',
      action_step_id: 'dispatch-bmad-refine',
    });
    expect(sent.issue_context).toMatchObject({
      number: 317,
      title: 'Refine me',
      body: 'Please refine acceptance criteria',
    });
    expect(context.getPersistedItem('issueUpdatedAtByNumber')).toContain('2026-04-23T00:00:00Z');
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

    const context = createJavascriptContext({
      body: JSON.stringify(issues),
      data: {
        'githubIssueWatcherCriteria': [
          {
            label: 'triage',
            assignee: 'machinoal2-cell',
            repo: 'opscotch/hopscotch',
            deploymentId: 'openclaw-ticket-actions',
            stepId: 'dispatch-bmad-refine',
          },
        ],
      },
      persistedItems: {
        issueUpdatedAtByNumber: JSON.stringify({ 'issue:317': '2026-04-23T00:00:00Z' }),
      },
    });

    await suite.run("resource", { context });

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

    const context = createJavascriptContext({
      body: JSON.stringify(issues),
      data: {
        githubIssueWatcherCriteria: [
          {
            label: 'triage',
            assignee: 'machinoal2-cell',
            repo: 'opscotch/hopscotch',
            deploymentId: 'openclaw-ticket-actions',
            stepId: 'dispatch-bmad-refine',
          },
        ],
      },
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
    });

    await suite.run("resource", { context });

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

    const context = createJavascriptContext({
      body: JSON.stringify(issues),
      data: {
        githubIssueWatcherCriteria: [
          {
            label: 'triage',
            assignee: 'machinoal2-cell',
            repo: 'opscotch/hopscotch',
            deploymentId: 'openclaw-ticket-actions',
            stepId: 'dispatch-bmad-refine-triage',
          },
        ],
      },
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
    });

    await suite.run("resource", { context });

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

    const context = createJavascriptContext({
      body: JSON.stringify(issues),
      data: {
        githubIssueWatcherCriteria: [
          {
            label: 'triage',
            assignee: 'machinoal2-cell',
            repo: 'opscotch/hopscotch',
            deploymentId: 'openclaw-ticket-actions',
            stepId: 'dispatch-bmad-refine',
          },
        ],
        issueHandoffDelaySeconds: 120,
      },
      timestamp: Date.parse('2026-04-23T00:02:00Z'),
    });

    await suite.run("resource", { context });

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

    const context = createJavascriptContext({
      body: JSON.stringify(mixed),
      data: {
        watchEntity: 'pr',
        githubPrWatcherCriteria: [
          {
            label: 'ready for dev',
            assignee: 'machinoal2-cell',
            repo: 'opscotch/hopscotch',
            deploymentId: 'openclaw-pr-actions',
            stepId: 'dispatch-bmad-pr-develop',
          },
        ],
      },
      sendToStep: (call) => {
        if (call.stepName === 'route-ticket-action') {
          return { body: JSON.stringify({ routed: true }) };
        }
        return { body: '{}' };
      },
    });

    await suite.run("resource", { context });

    expect(context.__sendToStepCalls).toHaveLength(1);
    const sent = JSON.parse(context.__sendToStepCalls[0].body || '{}');
    expect(sent).toMatchObject({
      entity_type: 'pr',
      issue_number: 402,
      pull_number: 402,
      pull_url: 'https://github.com/opscotch/hopscotch/pull/402',
      matched_label: 'ready for dev',
      action_deployment_id: 'openclaw-pr-actions',
      action_step_id: 'dispatch-bmad-pr-develop',
    });
    expect(JSON.parse(context.getPersistedItem('issueUpdatedAtByNumber') || '{}')).toMatchObject({
      'pr:402': '2026-04-23T00:06:00Z',
    });
  });
});
