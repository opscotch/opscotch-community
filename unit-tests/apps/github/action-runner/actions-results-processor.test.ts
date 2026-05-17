import path from 'node:path';
import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../../resources/apps/github/actions/actions-results-processor.js');

describe('github/action-runner actions-results-processor', () => {
  it('normalizes trigger-workflow response fields', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        workflow_run_id: 998877,
        run_url: 'https://api.github.com/repos/opscotch/hopscotch/actions/runs/998877',
        html_url: 'https://github.com/opscotch/hopscotch/actions/runs/998877',
      })
    });

    await runResource({ resource, context });

    expect(JSON.parse(context.getBody() || '{}')).toEqual({
      status: 'ok',
      operation: 'trigger-workflow',
      workflow_run_id: 998877,
      run_url: 'https://api.github.com/repos/opscotch/hopscotch/actions/runs/998877',
      html_url: 'https://github.com/opscotch/hopscotch/actions/runs/998877',
    });
  });
});
