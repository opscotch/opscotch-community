import path from 'node:path';
import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../../resources/apps/github/actions-payload-generator.js');

describe('github/action-runner actions-payload-generator', () => {
  it('builds trigger workflow payload', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        operation: 'trigger-workflow',
        repo: 'opscotch/hopscotch',
        ref: 'main',
        inputs: {
          issue: '317',
        },
      }),
    });

    await runResource({ resource, context });

    expect(context.getHeader('content-type')).toBe('application/json');
    expect(JSON.parse(context.getBody() || '{}')).toEqual({
      ref: 'main',
      inputs: {
        issue: '317',
      },
    });
  });

  it('sets empty payload for list-workflow-runs', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        operation: 'list-workflow-runs',
        repo: 'opscotch/hopscotch',
        workflow_id: 'ci.yml',
      }),
    });

    await runResource({ resource, context });

    expect(context.getBody()).toBe('');
  });

  it('requires ref for trigger-workflow', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        operation: 'trigger-workflow',
        repo: 'opscotch/hopscotch',
      }),
    });

    await expect(runResource({ resource, context })).rejects.toThrow('ref is required for trigger-workflow operation');
  });
});
