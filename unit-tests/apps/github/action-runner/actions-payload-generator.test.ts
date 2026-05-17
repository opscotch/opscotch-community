import path from 'node:path';
import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../../resources/apps/github/actions/actions-trigger-workflow-payload-generator.js');

describe('github/action-runner actions-payload-generator', () => {
  it('builds trigger workflow payload from body input', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        ref: 'main',
        inputs: { issue: '317' },
      }),
    });

    await runResource({ resource, context });

    expect(context.getHeader('content-type')).toBe('application/json');
    expect(JSON.parse(context.getBody() || '{}')).toEqual({
      ref: 'main',
      inputs: { issue: '317' },
    });
  });

  it('builds trigger workflow payload with ref in data', async () => {
    const context = createJavascriptContext({
      data: { ref: 'main' },
    });

    await runResource({ resource, context });

    expect(JSON.parse(context.getBody() || '{}').ref).toBe('main');
  });

  it('requires ref - throws error when missing', async () => {
    const context = createJavascriptContext({
      data: {},
    });

    await expect(runResource({ resource, context })).rejects.toThrow('ref is required');
  });

  it('data ref takes precedence over body input', async () => {
    const context = createJavascriptContext({
      data: { ref: 'main' },
      body: JSON.stringify({ ref: 'develop' }),
    });

    await runResource({ resource, context });

    expect(JSON.parse(context.getBody() || '{}').ref).toBe('main');
  });
});