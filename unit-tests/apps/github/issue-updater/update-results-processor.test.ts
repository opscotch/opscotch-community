import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../../resources/apps/github/issues/update-results-processor.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

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

    await suite.run("resource", { context });

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
