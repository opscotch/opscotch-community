import path from 'node:path';
import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../../resources/apps/github/actions-results-processor.js');

describe('github/action-runner actions-results-processor', () => {
  it('normalizes get-workflow-run completion fields', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        id: 998877,
        run_number: 42,
        workflow_id: 123,
        status: 'completed',
        conclusion: 'success',
        html_url: 'https://github.com/opscotch/hopscotch/actions/runs/998877',
      }),
      properties: {
        gh_action_operation: 'get-workflow-run',
        gh_action_repo: 'opscotch/hopscotch',
        status_code: '200',
      },
    });

    await runResource({ resource, context });

    expect(JSON.parse(context.getBody() || '{}')).toMatchObject({
      status: 'ok',
      operation: 'get-workflow-run',
      repo: 'opscotch/hopscotch',
      completed: true,
      success: true,
      run_status: 'completed',
      run_conclusion: 'success',
      run_id: 998877,
    });
  });

  it('normalizes list-workflow-runs output', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
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
      properties: {
        gh_action_operation: 'list-workflow-runs',
        gh_action_repo: 'opscotch/hopscotch',
      },
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
