import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../../resources/apps/github/actions/actions-get-failing-step-processor.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('github/action-runner actions-get-failing-step-processor', () => {
  it('extracts failing step metadata from run jobs payload', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        jobs: [
          {
            id: 111,
            run_id: 999,
            name: 'passing job',
            conclusion: 'success',
            status: 'completed',
            started_at: '2025-01-01T10:00:00Z',
            completed_at: '2025-01-01T10:05:00Z',
            run_url: 'https://api.github.com/repos/octo-org/octo-repo/actions/runs/999',
            steps: [
              { name: 'Checkout', number: 1, status: 'completed', conclusion: 'success', started_at: '2025-01-01T10:00:00Z', completed_at: '2025-01-01T10:01:00Z' }
            ],
          },
          {
            id: 222,
            run_id: 999,
            name: 'failing job',
            conclusion: 'failure',
            status: 'completed',
            started_at: '2025-01-01T10:00:00Z',
            completed_at: '2025-01-01T10:05:00Z',
            run_url: 'https://api.github.com/repos/octo-org/octo-repo/actions/runs/999',
            steps: [
              { name: '::group::noise', number: 1, status: 'completed', conclusion: 'success', started_at: '2025-01-01T10:00:00Z', completed_at: '2025-01-01T10:00:30Z' },
              { name: 'Build', number: 2, status: 'completed', conclusion: 'failure', started_at: '2025-01-01T10:00:30Z', completed_at: '2025-01-01T10:04:00Z' },
              { name: 'Tail', number: 3, status: 'completed', conclusion: 'skipped', started_at: '2025-01-01T10:04:00Z', completed_at: '2025-01-01T10:05:00Z' },
            ],
          },
        ],
      }),
    });

    await suite.run("resource", { context });

    const out = JSON.parse(context.getBody() || '{}');
    expect(out).toMatchObject({
      operation: 'get-failing-step',
      run_id: 999,
      job_id: 222,
      job_name: 'failing job',
      failing_step_name: 'Build',
      failing_step_number: 2,
    });
    expect(out.all_steps).toHaveLength(2);
  });
});