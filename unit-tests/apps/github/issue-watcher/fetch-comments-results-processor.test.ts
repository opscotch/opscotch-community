import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../../resources/apps/github/fetch-comments-results-processor.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('fetch-comments-results-processor', () => {
  it('normalizes array responses as ok comments payload', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify([
        { id: 1, body: 'first' },
        { id: 2, body: 'second' },
      ]),
    });

    await suite.run("resource", { context });

    expect(JSON.parse(context.getBody() || '{}')).toEqual({
      status: 'ok',
      comments: [
        { id: 1, body: 'first' },
        { id: 2, body: 'second' },
      ],
      comments_count: 2,
      omitted_resolved_comments_count: 0,
    });
  });

  it('rejects object responses that are not GraphQL review thread payloads', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({ message: 'not an array' }),
    });

    await expect(suite.run("resource", { context })).rejects.toThrow();
  });

  it('omits REST comments marked as resolved', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify([
        { id: 1, body: 'open' },
        { id: 2, body: 'done', resolved: true },
        { id: 3, body: 'also done', is_resolved: true },
      ]),
    });

    await suite.run("resource", { context });

    expect(JSON.parse(context.getBody() || '{}')).toEqual({
      status: 'ok',
      comments: [
        { id: 1, body: 'open' },
      ],
      comments_count: 1,
      omitted_resolved_comments_count: 2,
    });
  });

  it('normalizes GraphQL review thread comments and omits resolved threads', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        data: {
          repository: {
            pullRequest: {
              reviewThreads: {
                nodes: [
                  {
                    id: 'thread-open',
                    isResolved: false,
                    comments: {
                      nodes: [
                        {
                          id: 'comment-node-1',
                          databaseId: 101,
                          body: 'please change this',
                          author: { login: 'reviewer' },
                          createdAt: '2026-06-20T00:00:00Z',
                          updatedAt: '2026-06-20T00:00:00Z',
                          url: 'https://github.com/opscotch/repo/pull/1#discussion_r101',
                          path: 'file.js',
                          line: 12,
                          originalLine: 10,
                          diffHunk: '@@',
                        },
                      ],
                    },
                  },
                  {
                    id: 'thread-general',
                    isResolved: false,
                    comments: {
                      nodes: [
                        {
                          id: 'comment-node-3',
                          databaseId: 103,
                          body: 'general review comment',
                          author: { login: 'reviewer' },
                          createdAt: '2026-06-20T00:00:00Z',
                          updatedAt: '2026-06-20T00:00:00Z',
                          url: 'https://github.com/opscotch/repo/pull/1#discussion_r103',
                          path: null,
                          line: null,
                          originalLine: null,
                          diffHunk: null,
                        },
                      ],
                    },
                  },
                  {
                    id: 'thread-resolved',
                    isResolved: true,
                    comments: {
                      nodes: [
                        {
                          id: 'comment-node-2',
                          databaseId: 102,
                          body: 'already fixed',
                          author: { login: 'reviewer' },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      }),
    });

    await suite.run("resource", { context });

    expect(JSON.parse(context.getBody() || '{}')).toEqual({
      status: 'ok',
      comments: [
        {
          id: 101,
          node_id: 'comment-node-1',
          body: 'please change this',
          user: { login: 'reviewer' },
          author: 'reviewer',
          created_at: '2026-06-20T00:00:00Z',
          updated_at: '2026-06-20T00:00:00Z',
          html_url: 'https://github.com/opscotch/repo/pull/1#discussion_r101',
          path: 'file.js',
          line: 12,
          original_line: 10,
          diff_hunk: '@@',
          review_thread_id: 'thread-open',
          review_thread_resolved: false,
        },
        {
          id: 103,
          node_id: 'comment-node-3',
          body: 'general review comment',
          user: { login: 'reviewer' },
          author: 'reviewer',
          created_at: '2026-06-20T00:00:00Z',
          updated_at: '2026-06-20T00:00:00Z',
          html_url: 'https://github.com/opscotch/repo/pull/1#discussion_r103',
          path: null,
          line: null,
          original_line: null,
          diff_hunk: null,
          review_thread_id: 'thread-general',
          review_thread_resolved: false,
        },
      ],
      comments_count: 2,
      omitted_resolved_comments_count: 1,
    });
  });
});
