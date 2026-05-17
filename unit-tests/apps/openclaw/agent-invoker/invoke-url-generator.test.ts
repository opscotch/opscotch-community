import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../../resources/apps/openclaw/invoke-url-generator.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('apps/openclaw invoke-url-generator', () => {
  it('uses payload agent and host data', async () => {
    const context = createJavascriptContext({
      data: { openclawGatewayHostId: 'openclaw-local-gateway' },
      body: JSON.stringify({ agent: 'architect' }),
    });

    await suite.run("resource", { context });

    expect(context.__method).toBe('POST');
    expect(context.__url?.hostRef).toBe('openclaw-local-gateway');
    expect(context.__url?.path).toBe('/agents/architect/invoke');
    expect(context.getProperty('openclaw_agent')).toBe('architect');
  });
});
