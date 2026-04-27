import path from 'node:path';
import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../../resources/apps/github/poll-results-processor.js');

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
    });

    await runResource({ resource, context });

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
        issueUpdatedAtByNumber: JSON.stringify({ '317': '2026-04-23T00:00:00Z' }),
      },
    });

    await runResource({ resource, context });

    expect(context.__sendToStepCalls).toHaveLength(0);
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

    await runResource({ resource, context });

    expect(context.__sendToStepCalls).toHaveLength(0);
    expect(context.getPersistedItem('issueUpdatedAtByNumber')).toBe('{}');
    expect(JSON.parse(context.getBody() || '{}')).toEqual({
      status: 'ok',
      scanned_issues: 1,
      dispatched_actions: 0,
    });
  });
});
