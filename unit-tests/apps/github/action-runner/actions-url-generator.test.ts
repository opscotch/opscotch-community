import path from 'node:path';
import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../../resources/apps/github/actions/actions-url-generator.js');

describe('github/action-runner actions-url-generator', () => {
  it('builds dispatch URL for trigger-workflow', async () => {
    const context = createJavascriptContext({
      data: { hostId: 'github-api', operation: 'trigger-workflow' },
      body: JSON.stringify({
        operation: 'trigger-workflow',
        repo: 'opscotch/hopscotch',
        workflow_id: 'ci.yml',
        ref: 'main',
      }),
    });

    await runResource({ resource, context });

    expect(context.__method).toBe('POST');
    expect(context.__url?.hostRef).toBe('github-api');
    expect(context.__url?.path).toBe('/repos/opscotch/hopscotch/actions/workflows/ci.yml/dispatches');
  });

  it('builds workflow runs list URL', async () => {
    const context = createJavascriptContext({
      data: { hostId: 'github-api', operation: 'list-workflow-runs' },
      body: JSON.stringify({
        operation: 'list-workflow-runs',
        repo: 'opscotch/hopscotch',
        workflow_id: 'ci.yml',
        branch: 'main',
        per_page: 10,
      }),
    });

    await runResource({ resource, context });

    expect(context.__method).toBe('GET');
    expect(context.__url?.path).toContain('/repos/opscotch/hopscotch/actions/workflows/ci.yml/runs?');
    expect(context.__url?.path).toContain('per_page=10');
    expect(context.__url?.path).toContain('event=workflow_dispatch');
    expect(context.__url?.path).toContain('branch=main');
  });

  it('builds run lookup URL for get-workflow-run', async () => {
    const context = createJavascriptContext({
      data: { hostId: 'github-api', operation: 'get-workflow-run' },
      body: JSON.stringify({
        operation: 'get-workflow-run',
        repo: 'opscotch/hopscotch',
        run_id: 123456,
      }),
    });

    await runResource({ resource, context });

    expect(context.__method).toBe('GET');
    expect(context.__url?.path).toBe('/repos/opscotch/hopscotch/actions/runs/123456');
  });

  it('builds run jobs URL for get-failing-step', async () => {
    const context = createJavascriptContext({
      data: { hostId: 'github-api', operation: 'get-failing-step' },
      body: JSON.stringify({
        operation: 'get-failing-step',
        repo: 'opscotch/hopscotch',
        run_id: 123456,
        per_page: 50,
      }),
    });

    await runResource({ resource, context });

    expect(context.__method).toBe('GET');
    expect(context.__url?.path).toBe('/repos/opscotch/hopscotch/actions/runs/123456/jobs?per_page=50');
  });

});
