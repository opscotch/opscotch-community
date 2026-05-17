import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = '/workspace/dev_workspace/al.machino/implementation-artifacts/opscotch/github-ticket-poller/resources/track-bmad-develop-status.js';

describe('github-ticket-poller/track-bmad-develop-status', () => {
  it('recovers from invalid persisted task/issue-state JSON and returns snapshot', async () => {
    const stepProps: Record<string, string> = {
      'openclaw:develop:tasks': '{',
      'openclaw:develop:issue-state': '{"broken":',
    };

    const context = createJavascriptContext({
      body: JSON.stringify({ operation: 'snapshot' }),
      stepProperties: stepProps,
    });

    await runResource({ resource, context });

    expect(context.getBody()).toBeTruthy();
    expect(context.hasSystemErrors()).toBe(false);
  });
});
