import path from 'node:path';
import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../../resources/apps/github/update-url-generator.js');

describe('github/issue-updater update-url-generator', () => {
  it('builds patch URL for update-issue', async () => {
    const context = createJavascriptContext({
      data: { hostId: 'github-api' },
      body: JSON.stringify({ operation: 'update-issue', repo: 'opscotch/hopscotch', issue: 317, body: 'updated body' }),
    });

    await runResource({ resource, context });

    expect(context.__method).toBe('PATCH');
    expect(context.__url?.hostRef).toBe('github-api');
    expect(context.__url?.path).toBe('/repos/opscotch/hopscotch/issues/317');
    expect(context.getProperty('issue_operation')).toBe('update-issue');
    expect(context.getProperty('issue_repo')).toBe('opscotch/hopscotch');
    expect(context.getProperty('issue_number')).toBe('317');
  });

  it('requires label for remove-label', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({ operation: 'remove-label', repo: 'opscotch/hopscotch', issue: 317 }),
    });

    await expect(runResource({ resource, context })).rejects.toThrow('label is required');
  });
});
