import path from 'node:path';
import { createJavascriptContext, createJavascriptStateContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../resources/apps/mcp-framework/register.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('apps/mcp-framework/register', () => {
  it('forwards registration payloads to the registry step', async () => {
    const payload = {
      namespace: 'demo',
      tools: [
        {
          name: 'echo',
          handler: {
            deploymentAccessId: '_test_',
            stepId: 'echo-step',
          },
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          },
        },
      ],
    };
    const context = createJavascriptContext({
      passedMessage: JSON.stringify(payload),
      sendToStep(call) {
        if (call.stepName === 'registry') {
          return createJavascriptStateContext({
            body: JSON.stringify({
              ok: true,
              result: { namespace: 'demo' },
            }),
          });
        }
      },
    });

    await suite.run("resource", { context });

    expect(context.__sendToStepCalls).toEqual([
      {
        stepName: 'registry',
        body: JSON.stringify({
          action: 'register',
          payload,
        }),
        headers: undefined,
      },
    ]);
    expect(context.getBody()).toBe(JSON.stringify({
      ok: true,
      result: { namespace: 'demo' },
    }));
  });
});
