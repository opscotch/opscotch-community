import path from 'node:path';
import { createJavascriptContext, createJavascriptStateContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../resources/apps/mcp-framework/tools-list.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('apps/mcp-framework/tools-list', () => {
  it('returns tool descriptors from the registry', async () => {
    const context = createJavascriptContext({
      sendToStep(call) {
        if (call.stepName === 'registry') {
          return createJavascriptStateContext({
            body: JSON.stringify({
              ok: true,
              result: {
                tools: [
                  {
                    name: 'demo_echo',
                    title: 'Echo',
                    description: 'Echo tool',
                    inputSchema: {
                      type: 'object',
                    },
                    annotations: {
                      readOnlyHint: true,
                      destructiveHint: false,
                      idempotentHint: true,
                      openWorldHint: false,
                    },
                  },
                ],
              },
            }),
          });
        }
      },
    });

    await suite.run("resource", { context });

    expect(context.getBody()).toBe(JSON.stringify({
      ok: true,
      result: {
        tools: [
          {
            name: 'demo_echo',
            title: 'Echo',
            description: 'Echo tool',
            inputSchema: {
              type: 'object',
            },
            annotations: {
              readOnlyHint: true,
              destructiveHint: false,
              idempotentHint: true,
              openWorldHint: false,
            },
          },
        ],
      },
    }));
  });
});
