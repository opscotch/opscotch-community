import path from 'node:path';
import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../resources/apps/mcp-framework/initialize.js');

describe('apps/mcp-framework/initialize', () => {
  it('returns fixed server metadata and capabilities', async () => {
    const context = createJavascriptContext();

    await runResource({ resource, context });

    expect(context.getBody()).toBe(JSON.stringify({
      ok: true,
      result: {
        protocolVersion: '2025-03-26',
        serverInfo: {
          name: 'opscotch-mcp-framework',
          version: '0.1.0',
        },
        capabilities: {
          tools: {
            listChanged: false,
          },
          resources: {
            listChanged: false,
            subscribe: false,
          },
          prompts: {
            listChanged: false,
          },
        },
      },
    }));
  });
});
