import path from 'node:path';
import { createJavascriptContext, createJavascriptStateContext, runResource } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../resources/apps/mcp-framework/tools-call.js');

describe('apps/mcp-framework/tools-call', () => {
  it('looks up a tool and normalizes the callback response', async () => {
    const context = createJavascriptContext({
      passedMessage: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'demo_echo',
          arguments: { text: 'hello' },
        },
      }),
      sendToStep(call) {
        if (call.stepName === 'registry') {
          return createJavascriptStateContext({
            body: JSON.stringify({
              ok: true,
              result: {
                tool: {
                  name: 'demo_echo',
                  namespace: 'demo',
                  handler: {
                    deploymentAccessId: '_test_',
                    stepId: 'echo-step',
                  },
                },
              },
            }),
          });
        }
        if (call.stepName === 'echo-step') {
          return createJavascriptStateContext({
            body: JSON.stringify({ echoed: true }),
          });
        }
      },
    });

    await runResource({ resource, context });

    expect(context.getBody()).toBe(JSON.stringify({
      ok: true,
      result: {
        content: [
          {
            type: 'text',
            text: '{"echoed":true}',
          },
        ],
        structuredContent: {
          echoed: true,
        },
      },
    }));
  });
});
