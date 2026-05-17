import path from 'node:path';
import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../../resources/apps/github/issues/update-results-processor.js');

describe('github/issue-updater update-results-processor', () => {
  it('normalizes successful response', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({ id: 12345, body: 'ok' }),
      properties: {
        issue_operation: 'add-comment',
        issue_repo: 'opscotch/hopscotch',
        issue_number: '317',
        status_code: '201',
      },
    });

    await runResource({ resource, context });

    expect(JSON.parse(context.getBody() || '{}')).toEqual({
      status: 'ok',
      operation: 'add-comment',
      repo: 'opscotch/hopscotch',
      issue: 317,
      status_code: '201',
      response: { id: 12345, body: 'ok' },
    });
  });
});
