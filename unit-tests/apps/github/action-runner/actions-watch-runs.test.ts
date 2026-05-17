import path from 'node:path';
import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../../resources/apps/github/actions/actions-watch-runs.js');

describe('github/action-runner actions-watch-runs', () => {
  it('routes newly completed workflow runs and stores bounded watermark state', async () => {
    const context = createJavascriptContext({
      data: {
        githubActionWatcherCriteria: [
          {
            repo: 'opscotch/builder',
            workflow_id: 'multistage-build.yml',
            state: 'status:completed',
            branch: 'main',
            event: 'workflow_dispatch',
            deploymentId: 'notify-target',
            stepId: 'on-build-complete',
            per_page: 20,
          },
        ],
      },
      persistedItems: {
        'github-action-watcher.state': JSON.stringify({
          criteria: {
            'opscotch/builder|multistage-build.yml|main|workflow_dispatch|status:completed': {
              watermark_updated_at: '2026-05-01T00:00:00Z',
              watermark_ts: Date.parse('2026-05-01T00:00:00Z'),
              notified_run_ids_at_watermark: [100],
            },
          },
        }),
      },
      sendToStep: (call) => {
        if (call.stepName === 'github-action-list-runs') {
          return {
            body: JSON.stringify({
              runs: [
                {
                  id: 101,
                  run_number: 11,
                  status: 'completed',
                  conclusion: 'success',
                  event: 'workflow_dispatch',
                  head_branch: 'main',
                  updated_at: '2026-05-01T00:01:00Z',
                  html_url: 'https://github.com/opscotch/builder/actions/runs/101',
                },
              ],
            }),
          };
        }
        return { body: '{}' };
      },
    });

    await runResource({ resource, context });

    expect(context.__sendToStepCalls.some((call) => call.stepName === 'on-build-complete')).toBe(true);
    const out = JSON.parse(context.getBody() || '{}');
    expect(out.notifications_sent).toBe(1);

    const persisted = JSON.parse(context.getPersistedItem('github-action-watcher.state') || '{}');
    const key = 'opscotch/builder|multistage-build.yml|main|workflow_dispatch|status:completed';
    expect(persisted.criteria[key].watermark_updated_at).toBe('2026-05-01T00:01:00Z');
    expect(persisted.criteria[key].notified_run_ids_at_watermark).toContain(101);
  });

  it('does not re-notify already-watermarked runs', async () => {
    const context = createJavascriptContext({
      data: {
        githubActionWatcherCriteria: [
          {
            repo: 'opscotch/builder',
            workflow_id: 'multistage-build.yml',
            state: 'status:completed',
            branch: 'main',
            event: 'workflow_dispatch',
            deploymentId: 'notify-target',
            stepId: 'on-build-complete',
          },
        ],
      },
      persistedItems: {
        'github-action-watcher.state': JSON.stringify({
          criteria: {
            'opscotch/builder|multistage-build.yml|main|workflow_dispatch|status:completed': {
              watermark_updated_at: '2026-05-01T00:01:00Z',
              watermark_ts: Date.parse('2026-05-01T00:01:00Z'),
              notified_run_ids_at_watermark: [101],
            },
          },
        }),
      },
      sendToStep: (call) => {
        if (call.stepName === 'github-action-list-runs') {
          return {
            body: JSON.stringify({
              runs: [
                {
                  id: 101,
                  run_number: 11,
                  status: 'completed',
                  conclusion: 'success',
                  event: 'workflow_dispatch',
                  head_branch: 'main',
                  updated_at: '2026-05-01T00:01:00Z',
                  html_url: 'https://github.com/opscotch/builder/actions/runs/101',
                },
              ],
            }),
          };
        }
        return { body: '{}' };
      },
    });

    await runResource({ resource, context });

    expect(context.__sendToStepCalls.some((call) => call.stepName === 'on-build-complete')).toBe(false);
    const out = JSON.parse(context.getBody() || '{}');
    expect(out.notifications_sent).toBe(0);
  });
});
