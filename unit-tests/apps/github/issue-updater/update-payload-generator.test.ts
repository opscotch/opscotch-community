import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../../resources/apps/github/issues/update-payload-generator.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

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

    await suite.run("resource", { context });

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

    await suite.run("resource", { context });

    expect(context.getBody()).toBe('');
  });

  it('requires at least one mutable field for update-issue', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({ operation: 'update-issue', repo: 'opscotch/hopscotch', issue: 317 }),
    });

    await expect(suite.run("resource", { context })).rejects.toThrow('at least one mutable field');
  });

  it('sets empty payload for delete-comment', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        operation: 'delete-comment',
        repo: 'opscotch/hopscotch',
        issue: 317,
        comment_id: 12345,
      }),
    });

    await suite.run("resource", { context });

    expect(context.getBody()).toBe('');
  });

  it('requires comment_id for delete-comment', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        operation: 'delete-comment',
        repo: 'opscotch/hopscotch',
        issue: 317,
      }),
    });

    await expect(suite.run("resource", { context })).rejects.toThrow('comment_id is required');
  });

  it('builds create-pr payload', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        operation: 'create-pr',
        repo: 'opscotch/hopscotch',
        issue: 317,
        title: 'Issue #317',
        head: 'opscotch/issue-317-develop',
        base: 'main',
        body: 'PR body',
      }),
    });

    await suite.run("resource", { context });

    expect(JSON.parse(context.getBody() || '{}')).toEqual({
      title: 'Issue #317',
      head: 'opscotch/issue-317-develop',
      base: 'main',
      body: 'PR body',
    });
  });

  it('sets empty payload for get-open-pr-by-head', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        operation: 'get-open-pr-by-head',
        repo: 'opscotch/hopscotch',
        issue: 317,
        head: 'opscotch/issue-317-develop',
      }),
    });

    await suite.run("resource", { context });

    expect(context.getBody()).toBe('');
  });

  it('builds request-reviewers payload', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        operation: 'request-reviewers',
        repo: 'opscotch/hopscotch',
        issue: 317,
        pull_number: 88,
        reviewers: ['jscottnz'],
      }),
    });

    await suite.run("resource", { context });

    expect(JSON.parse(context.getBody() || '{}')).toEqual({
      reviewers: ['jscottnz'],
    });
  });
});
