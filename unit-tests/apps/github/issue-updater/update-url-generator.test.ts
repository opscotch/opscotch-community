import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../../resources/apps/github/issues/update-url-generator.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('github/issue-updater update-url-generator', () => {
  it('builds patch URL for update-issue', async () => {
    const context = createJavascriptContext({
      data: { hostId: 'github-api' },
      body: JSON.stringify({ operation: 'update-issue', repo: 'opscotch/hopscotch', issue: 317, body: 'updated body' }),
    });

    await suite.run("resource", { context });

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

    await expect(suite.run("resource", { context })).rejects.toThrow('label is required');
  });

  it('builds delete URL for delete-comment', async () => {
    const context = createJavascriptContext({
      data: { hostId: 'github-api' },
      body: JSON.stringify({ operation: 'delete-comment', repo: 'opscotch/hopscotch', issue: 317, comment_id: 12345 }),
    });

    await suite.run("resource", { context });

    expect(context.__method).toBe('DELETE');
    expect(context.__url?.hostRef).toBe('github-api');
    expect(context.__url?.path).toBe('/repos/opscotch/hopscotch/issues/comments/12345');
    expect(context.getProperty('issue_operation')).toBe('delete-comment');
  });

  it('builds pull lookup URL for get-open-pr-by-head', async () => {
    const context = createJavascriptContext({
      data: { hostId: 'github-api' },
      body: JSON.stringify({ operation: 'get-open-pr-by-head', repo: 'opscotch/hopscotch', issue: 317, head: 'opscotch/issue-317-develop' }),
    });

    await suite.run("resource", { context });

    expect(context.__method).toBe('GET');
    expect(context.__url?.hostRef).toBe('github-api');
    expect(context.__url?.path).toBe('/repos/opscotch/hopscotch/pulls?state=open&head=opscotch%3Aopscotch%2Fissue-317-develop');
  });

  it('builds read URLs for comments and work branches', async () => {
    const comments = createJavascriptContext({ data: { hostId: 'github-api' }, body: JSON.stringify({ operation: 'list-comments', repo: 'opscotch/hopscotch', issue: 317 }) });
    await suite.run("resource", { context: comments });
    expect(comments.__method).toBe('GET');
    expect(comments.__url?.path).toBe('/repos/opscotch/hopscotch/issues/317/comments?per_page=100');

    const branch = createJavascriptContext({ data: { hostId: 'github-api' }, body: JSON.stringify({ operation: 'get-branch', repo: 'opscotch/hopscotch', issue: 317, branch: 'opscotch/issue-317-develop' }) });
    await suite.run("resource", { context: branch });
    expect(branch.__method).toBe('GET');
    expect(branch.__url?.path).toBe('/repos/opscotch/hopscotch/branches/opscotch%2Fissue-317-develop');
  });

  it('builds reviewer request URL', async () => {
    const context = createJavascriptContext({
      data: { hostId: 'github-api' },
      body: JSON.stringify({ operation: 'request-reviewers', repo: 'opscotch/hopscotch', issue: 317, pull_number: 88, reviewers: ['jscottnz'] }),
    });

    await suite.run("resource", { context });

    expect(context.__method).toBe('POST');
    expect(context.__url?.path).toBe('/repos/opscotch/hopscotch/pulls/88/requested_reviewers');
  });
});
