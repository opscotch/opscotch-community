import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../../resources/apps/github/actions/actions-get-workflow-run-processor.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('github/action-runner actions-get-workflow-run-processor', () => {
  it('normalizes get-workflow-run completion fields', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        repo: 'opscotch/hopscotch',
        status_code: '200',
        id: 998877,
        run_number: 42,
        workflow_id: 123,
        status: 'completed',
        conclusion: 'success',
        html_url: 'https://github.com/opscotch/hopscotch/actions/runs/998877',
        logs_url: 'https://api.github.com/repos/opscotch/hopscotch/actions/runs/998877/logs',
      }),
    });

    await suite.run("resource", { context });

    expect(JSON.parse(context.getBody() || '{}')).toMatchObject({
      status: 'ok',
      operation: 'get-workflow-run',
      completed: true,
      success: true,
      run_status: 'completed',
      run_conclusion: 'success',
      run_id: 998877,
      logs_url: 'https://api.github.com/repos/opscotch/hopscotch/actions/runs/998877/logs',
    });
  });
});
