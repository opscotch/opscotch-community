import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = '/workspace/dev_workspace/al.machino/implementation-artifacts/opscotch/github-ticket-poller/resources/report-bmad-develop-status.js';

describe('github-ticket-poller/report-bmad-develop-status', () => {
  it('handles non-JSON snapshot response without throwing', async () => {
    const context = createJavascriptContext({
      sendToStep: () => ({ body: 'status ok' }),
    });

    await runResource({ resource, context });

    const out = JSON.parse(context.getBody() || '{}');
    expect(out).toEqual({
      status: 'ok',
      summary: {},
    });
  });

  it('throws when snapshot response body is an object instead of a JSON string', async () => {
    const context = createJavascriptContext({
      sendToStep: () => ({ body: { status: 'ok' } }),
    });

    await expect(runResource({ resource, context })).rejects.toThrow(
      'Expected string body from track-bmad-develop-status but received object',
    );
  });
});
