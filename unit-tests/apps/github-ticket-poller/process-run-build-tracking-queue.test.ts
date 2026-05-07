import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = '/home/jeremy/dev/opscotch/dev_workspace/al.machino/implementation-artifacts/opscotch/github-ticket-poller/resources/process-run-build-tracking-queue.js';

describe('github-ticket-poller/process-run-build-tracking-queue', () => {
  it('enqueues incoming run tracking item', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        repo: 'opscotch/hopscotch',
        pull_number: 451,
        run_id: 123,
      }),
    });

    await runResource({ resource, context });

    expect(JSON.parse(context.getBody() || '{}')).toMatchObject({ queued: true, queue_size: 1 });
    expect(JSON.parse(context.getPersistedItem('builder:run-tracking:queue') || '[]')).toHaveLength(1);
  });

  it('requeues item when run is not complete', async () => {
    const context = createJavascriptContext({
      persistedItems: {
        'builder:run-tracking:queue': JSON.stringify([
          { repo: 'opscotch/hopscotch', pull_number: 451, run_id: 123, builder_repo: 'opscotch/builder', started_at_ts: Date.now() },
        ]),
      },
      sendToStep: (call) => {
        if (call.stepName === 'invoke-builder-get-run') {
          return { body: JSON.stringify({ completed: false }) };
        }
        return { body: '{}' };
      },
    });

    await runResource({ resource, context });

    expect(JSON.parse(context.getBody() || '{}')).toMatchObject({ processed: true, completed: false, run_id: 123 });
    expect(JSON.parse(context.getPersistedItem('builder:run-tracking:queue') || '[]')).toHaveLength(1);
  });

  it('comments and removes item when run completes', async () => {
    const context = createJavascriptContext({
      persistedItems: {
        'builder:run-tracking:queue': JSON.stringify([
          { repo: 'opscotch/hopscotch', pull_number: 451, run_id: 123, builder_repo: 'opscotch/builder', started_at_ts: Date.now() },
        ]),
      },
      sendToStep: (call) => {
        if (call.stepName === 'invoke-builder-get-run') {
          return { body: JSON.stringify({ completed: true, success: true, run_id: 123, run_conclusion: 'success', html_url: 'https://example/runs/123' }) };
        }
        return { body: JSON.stringify({ status: 'ok' }) };
      },
    });

    await runResource({ resource, context });

    expect(JSON.parse(context.getBody() || '{}')).toMatchObject({ processed: true, completed: true, success: true, run_id: 123 });
    expect(JSON.parse(context.getPersistedItem('builder:run-tracking:queue') || '[]')).toHaveLength(0);
    expect(context.__sendToStepCalls.some((c) => c.deploymentAccessId === 'github-issue-updater')).toBe(true);
  });
});
