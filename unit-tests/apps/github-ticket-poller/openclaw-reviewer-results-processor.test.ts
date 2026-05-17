import { existsSync } from 'node:fs';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const mountedResource = '/workspace/dev_workspace/al.machino/implementation-artifacts/opscotch/github-ticket-poller/resources/openclaw-reviewer-results-processor.js';
const localResource = '/home/jeremy/dev/opscotch/dev_workspace/al.machino/implementation-artifacts/opscotch/github-ticket-poller/resources/openclaw-reviewer-results-processor.js';
const resource = existsSync(mountedResource) ? mountedResource : localResource;

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('github-ticket-poller/openclaw-reviewer-results-processor', () => {
  it('passes through accepted callback envelope fields and omits error when absent', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        status: 'accepted',
        request_id: 'req-1',
        output: { note: 'accepted by wrapper' },
      }),
    });

    await suite.run("resource", { context });

    const out = JSON.parse(context.getBody() || '{}');
    expect(out).toMatchObject({
      dispatcher: 'openclaw-local-gateway',
      operation: 'refine',
      request_id: 'req-1',
      output: { note: 'accepted by wrapper' },
      response: {
        status: 'accepted',
        request_id: 'req-1',
      },
    });
    expect(out.error).toBeUndefined();
  });

  it('includes error when upstream sends error object', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        request_id: 'req-2',
        error: {
          code: 'rate_limited',
          message: 'OpenClaw invoke already in progress',
          retryable: true,
        },
      }),
    });

    await suite.run("resource", { context });

    const out = JSON.parse(context.getBody() || '{}');
    expect(out).toMatchObject({
      request_id: 'req-2',
      error: {
        code: 'rate_limited',
        retryable: true,
      },
    });
  });
});
