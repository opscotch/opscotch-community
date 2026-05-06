import path from 'node:path';
import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../../resources/apps/github/fetch-comments-url-generator.js');

describe('fetch-comments-url-generator', () => {
  it('builds issue comments url by default', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        repo: 'opscotch/hopscotch',
        issue: 317,
      }),
      data: {
        hostId: 'github-api',
      },
    });

    await runResource({ resource, context });

    expect(context.__method).toBe('GET');
    expect(context.__url?.hostRef).toBe('github-api');
    expect(context.__url?.path).toBe('/repos/opscotch/hopscotch/issues/317/comments?per_page=100&sort=updated&direction=asc');
    expect(context.getHeader('accept')).toBe('application/vnd.github+json');
    expect(context.getHeader('x-github-api-version')).toBe('2022-11-28');
  });

  it('builds pull request review comments url when entity_type is pr', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        repo: 'opscotch/hopscotch',
        issue: 317,
        entity_type: 'pr',
        pull_number: 91,
      }),
      data: {
        hostId: 'github-api',
      },
    });

    await runResource({ resource, context });

    expect(context.__method).toBe('GET');
    expect(context.__url?.hostRef).toBe('github-api');
    expect(context.__url?.path).toBe('/repos/opscotch/hopscotch/pulls/91/comments?per_page=100&sort=updated&direction=asc');
    expect(context.getHeader('accept')).toBe('application/vnd.github+json');
    expect(context.getHeader('x-github-api-version')).toBe('2022-11-28');
  });
});
