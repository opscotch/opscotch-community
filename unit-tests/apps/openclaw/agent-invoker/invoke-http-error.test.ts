import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../../resources/apps/openclaw/invoke-http-error.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('apps/openclaw invoke-http-error', () => {
  it('records system error and wraps failure body', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({ message: 'failed' }),
      properties: {
        status_code: '502',
        openclaw_agent: 'reviewer',
      },
    });

    await suite.run("resource", { context });

    expect(context.hasSystemErrors()).toBe(true);
    expect(context.getSystemErrors().join(' ')).toContain('failed with status 502');
    expect(JSON.parse(context.getBody() || '{}')).toEqual({
      queued: false,
      status_code: '502',
      agent: 'reviewer',
      response: JSON.stringify({ message: 'failed' }),
    });
  });
});
