import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../../resources/apps/github/fetch-comments-payload-generator.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('fetch-comments-payload-generator', () => {
  it('builds GraphQL review thread comments payload from url-generator metadata', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        repo: 'opscotch/hopscotch',
        issue: 317,
        entity_type: 'pr',
        pull_number: 91,
      }),
    });

    await suite.run("resource", { context });

    expect(context.getHeader('content-type')).toBe('application/json');
    expect(JSON.parse(context.getBody() || '{}')).toMatchObject({
      variables: {
        owner: 'opscotch',
        name: 'hopscotch',
        number: 91,
      },
    });
    expect(JSON.parse(context.getBody() || '{}').query).toContain('reviewThreads');
    expect(JSON.parse(context.getBody() || '{}').query).toContain('isResolved');
  });

  it('leaves issue comment requests without a payload', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({ repo: 'opscotch/hopscotch', issue: 317 }),
    });

    await suite.run("resource", { context });

    expect(context.getBody()).toBe('');
  });
});
