import path from 'node:path';
import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../../resources/apps/github/fetch-comments-results-processor.js');

describe('fetch-comments-results-processor', () => {
  it('normalizes array responses as ok comments payload', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify([
        { id: 1, body: 'first' },
        { id: 2, body: 'second' },
      ]),
    });

    await runResource({ resource, context });

    expect(JSON.parse(context.getBody() || '{}')).toEqual({
      status: 'ok',
      comments: [
        { id: 1, body: 'first' },
        { id: 2, body: 'second' },
      ],
      comments_count: 2,
    });
  });

  it('normalizes non-array responses to empty comments', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({ message: 'not an array' }),
    });

    await runResource({ resource, context });

    expect(JSON.parse(context.getBody() || '{}')).toEqual({
      status: 'ok',
      comments: [],
      comments_count: 0,
    });
  });
});
