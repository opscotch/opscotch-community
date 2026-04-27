import path from 'node:path';
import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../../resources/apps/github/update-payload-generator.js');

describe('github/issue-updater update-payload-generator', () => {
  it('builds add-comment body payload', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        operation: 'add-comment',
        repo: 'opscotch/hopscotch',
        issue: 317,
        comment: 'Please investigate.',
      }),
    });

    await runResource({ resource, context });

    expect(context.getHeader('content-type')).toBe('application/json');
    expect(JSON.parse(context.getBody() || '{}')).toEqual({ body: 'Please investigate.' });
  });

  it('sets empty payload for remove-label', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        operation: 'remove-label',
        repo: 'opscotch/hopscotch',
        issue: 317,
        label: 'triage',
      }),
    });

    await runResource({ resource, context });

    expect(context.getBody()).toBe('');
  });

  it('requires at least one mutable field for update-issue', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({ operation: 'update-issue', repo: 'opscotch/hopscotch', issue: 317 }),
    });

    await expect(runResource({ resource, context })).rejects.toThrow('at least one mutable field');
  });
});
