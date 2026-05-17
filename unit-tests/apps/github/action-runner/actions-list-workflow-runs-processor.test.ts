import path from 'node:path';
import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../../resources/apps/github/actions/actions-list-workflow-runs-processor.js');

describe('github/action-runner actions-list-workflow-runs-processor', () => {
  it('normalizes list-workflow-runs output', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        repo: 'opscotch/hopscotch',
        status_code: '200',
        total_count: 1,
        workflow_runs: [
          {
            id: 998877,
            run_number: 42,
            status: 'in_progress',
            conclusion: null,
            event: 'workflow_dispatch',
            head_branch: 'main',
            created_at: '2026-05-01T00:00:00Z',
            updated_at: '2026-05-01T00:01:00Z',
            html_url: 'https://github.com/opscotch/hopscotch/actions/runs/998877',
          },
        ],
      }),
    });

    await runResource({ resource, context });

    expect(JSON.parse(context.getBody() || '{}')).toMatchObject({
      status: 'ok',
      operation: 'list-workflow-runs',
      total_count: 1,
    });
    expect(JSON.parse(context.getBody() || '{}').runs).toHaveLength(1);
  });
});