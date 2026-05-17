import path from 'node:path';
import { createJavascriptContext, createJavascriptStateContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../resources/apps/mcp-framework/prompts-list.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('apps/mcp-framework/prompts-list', () => {
  it('returns prompt descriptors from the registry', async () => {
    const context = createJavascriptContext({
      sendToStep(call) {
        if (call.stepName === 'registry') {
          return createJavascriptStateContext({
            body: JSON.stringify({
              ok: true,
              result: {
                prompts: [
                  {
                    name: 'demo_greet',
                    title: 'Greeting',
                    description: 'Greeting prompt',
                    arguments: [{ name: 'name' }],
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
        prompts: [
          {
            name: 'demo_greet',
            title: 'Greeting',
            description: 'Greeting prompt',
            arguments: [{ name: 'name' }],
          },
        ],
      },
    }));
  });
});
