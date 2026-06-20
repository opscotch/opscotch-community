import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../../resources/apps/github/poll-split-generator.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('poll-split-generator', () => {
  it('emits one split item per issue repo group', async () => {
    const context = createJavascriptContext({
      data: {
        githubIssueWatcherRepos: [
          {
            repo: 'opscotch/hopscotch',
            assignee: 'machinoal2-cell',
            criteria: [
              {
                label: 'triage',
                deploymentId: 'ticket-actions',
                stepId: 'dispatch-triage',
              },
            ],
          },
          {
            repo: 'opscotch/opscotch-apps-source',
            assignee: 'machinoal2-cell',
            criteria: [
              {
                label: 'ready for dev',
                deploymentId: 'ticket-actions',
                stepId: 'dispatch-dev',
              },
            ],
          },
        ],
      },
    });

    await suite.run("resource", { context });

    expect(context.__splitReturnItems).toHaveLength(2);
    expect(JSON.parse(context.__splitReturnItems[0])).toMatchObject({
      repo: 'opscotch/hopscotch',
      assignee: 'machinoal2-cell',
      watchEntity: 'issue',
      criteria: [{ label: 'triage' }],
    });
    expect(JSON.parse(context.__splitReturnItems[1])).toMatchObject({
      repo: 'opscotch/opscotch-apps-source',
      watchEntity: 'issue',
      criteria: [{ label: 'ready for dev' }],
    });
  });

  it('emits pr repo groups when watchEntity is pr', async () => {
    const context = createJavascriptContext({
      data: {
        watchEntity: 'pr',
        githubPrWatcherRepos: [
          {
            repo: 'opscotch/hopscotch',
            assignee: 'machinoal2-cell',
            criteria: [
              {
                label: 'run build',
                deploymentId: 'pr-actions',
                stepId: 'dispatch-run-build',
              },
            ],
          },
        ],
      },
    });

    await suite.run("resource", { context });

    expect(context.__splitReturnItems).toHaveLength(1);
    expect(JSON.parse(context.__splitReturnItems[0])).toMatchObject({
      repo: 'opscotch/hopscotch',
      watchEntity: 'pr',
      criteria: [{ label: 'run build' }],
    });
  });
});
