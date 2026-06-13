import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(
  import.meta.dirname,
  '../../../../../apps/opscotch-ai-developer/opscotch/resources/track-bmad-develop-status.js',
);

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

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

    await suite.run("resource", { context });

    expect(context.getBody()).toBeTruthy();
    expect(context.hasSystemErrors()).toBe(false);
  });
});
