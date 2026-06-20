import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../../resources/apps/github/poll-item-result-processor.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('poll-item-result-processor', () => {
  it('wraps an array response with poll group metadata', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify([{ number: 317, title: 'Issue' }]),
      properties: {
        gh_poll_group: JSON.stringify({
          repo: 'opscotch/hopscotch',
          assignee: 'machinoal2-cell',
          watchEntity: 'issue',
          criteria: [{ label: 'triage', deploymentId: 'ticket-actions', stepId: 'dispatch-triage' }],
        }),
      },
    });

    await suite.run("resource", { context });

    expect(JSON.parse(context.getBody())).toEqual({
      repo: 'opscotch/hopscotch',
      assignee: 'machinoal2-cell',
      watchEntity: 'issue',
      criteria: [{ label: 'triage', deploymentId: 'ticket-actions', stepId: 'dispatch-triage' }],
      items: [{ number: 317, title: 'Issue' }],
    });
  });

  it('unwraps search-style items defensively', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({ items: [{ number: 402, title: 'PR' }] }),
      properties: {
        gh_poll_group: JSON.stringify({
          repo: 'opscotch/hopscotch',
          assignee: 'machinoal2-cell',
          watchEntity: 'pr',
          criteria: [{ label: 'run build', deploymentId: 'pr-actions', stepId: 'dispatch-run-build' }],
        }),
      },
    });

    await suite.run("resource", { context });

    expect(JSON.parse(context.getBody())).toMatchObject({
      repo: 'opscotch/hopscotch',
      watchEntity: 'pr',
      items: [{ number: 402, title: 'PR' }],
    });
  });
});
