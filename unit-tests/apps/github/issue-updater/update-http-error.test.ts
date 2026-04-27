import path from 'node:path';
import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../../resources/apps/github/update-http-error.js');

describe('github/issue-updater update-http-error', () => {
  it('records system error and wraps failure payload', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({ message: 'validation failed' }),
      properties: {
        status_code: '422',
        issue_operation: 'set-labels',
        issue_repo: 'opscotch/hopscotch',
        issue_number: '317',
      },
    });

    await runResource({ resource, context });

    expect(context.hasSystemErrors()).toBe(true);
    expect(context.getSystemErrors().join(' ')).toContain('failed with status 422');
    expect(JSON.parse(context.getBody() || '{}')).toEqual({
      status: 'error',
      operation: 'set-labels',
      repo: 'opscotch/hopscotch',
      issue: 317,
      status_code: '422',
      response: JSON.stringify({ message: 'validation failed' }),
    });
  });
});
