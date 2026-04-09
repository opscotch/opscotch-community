import path from 'node:path';
import { createJavascriptContext, createJavascriptStateContext, runResource } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../resources/apps/mcp-framework/prompts-get.js');

describe('apps/mcp-framework/prompts-get', () => {
  it('returns a static prompt from the registry lookup', async () => {
    const context = createJavascriptContext({
      passedMessage: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'prompts/get',
        params: {
          name: 'demo_greet',
        },
      }),
      sendToStep(call) {
        if (call.stepName === 'registry') {
          return createJavascriptStateContext({
            body: JSON.stringify({
              ok: true,
              result: {
                prompt: {
                  name: 'demo_greet',
                  description: 'Greeting prompt',
                  source: {
                    type: 'static',
                    text: 'Hello there',
                  },
                },
              },
            }),
          });
        }
      },
    });

    await runResource({ resource, context });

    expect(context.getBody()).toBe(JSON.stringify({
      ok: true,
      result: {
        description: 'Greeting prompt',
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: 'Hello there',
            },
          },
        ],
      },
    }));
  });
});
