import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(
  import.meta.dirname,
  '../../../../../apps/opscotch-ai-developer/opscotch/resources/process-run-build-tracking-queue.js',
);

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('github-ticket-poller/process-run-build-tracking-queue', () => {
  it('enqueues incoming run tracking item', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        repo: 'opscotch/hopscotch',
        pull_number: 451,
        run_id: 123,
      }),
    });

    await suite.run("resource", { context });

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

    await suite.run("resource", { context });

    expect(JSON.parse(context.getBody() || '{}')).toMatchObject({ processed: true, completed: false, run_id: 123 });
    expect(JSON.parse(context.getPersistedItem('builder:run-tracking:queue') || '[]')).toHaveLength(1);
  });

  it('comments and removes tracked item on completed notification', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        notification_type: 'github-action-state-change',
        run: { id: 123, status: 'completed', conclusion: 'success', html_url: 'https://example/runs/123' },
      }),
      persistedItems: {
        'builder:run-tracking:queue': JSON.stringify([
          { repo: 'opscotch/hopscotch', pull_number: 451, run_id: 123, builder_repo: 'opscotch/builder', started_at_ts: Date.now() },
        ]),
      },
      sendToStep: (call) => {
        if (call.stepName === 'github-action-get-run') {
          return {
            body: JSON.stringify({
              status: 'ok',
              run_id: 123,
              run_conclusion: 'success',
              html_url: 'https://example/runs/123',
              logs_url: 'https://api.github.com/repos/opscotch/builder/actions/runs/123/logs',
            }),
          };
        }
        if (call.stepName === 'github-action-get-run-logs') {
          return {
            body: JSON.stringify({
              status: 'ok',
              status_code: '302',
              redirect_location: 'https://objects.githubusercontent.com/signed-log.zip',
              redirect_handled: true,
            }),
          };
        }
        return { body: JSON.stringify({ status: 'ok' }) };
      },
    });

    await suite.run("resource", { context });

    expect(JSON.parse(context.getBody() || '{}')).toMatchObject({ processed: true, completed: true, success: true, run_id: 123 });
    expect(JSON.parse(context.getPersistedItem('builder:run-tracking:queue') || '[]')).toHaveLength(0);
    expect(context.__sendToStepCalls.some((c) => c.deploymentAccessId === 'github-issue-updater')).toBe(true);
  });
});
