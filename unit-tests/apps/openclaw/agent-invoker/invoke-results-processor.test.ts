import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../../resources/apps/openclaw/invoke-results-processor.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('apps/openclaw invoke-results-processor', () => {
  it('normalizes invoke response', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({ accepted: true }),
      properties: { openclaw_agent: 'reviewer' },
    });

    await suite.run("resource", { context });

    expect(JSON.parse(context.getBody() || '{}')).toEqual({
      queued: true,
      dispatcher: 'openclaw-local-gateway',
      agent: 'reviewer',
      response: { accepted: true },
    });
  });
});
