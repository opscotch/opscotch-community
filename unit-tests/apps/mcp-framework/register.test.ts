import path from 'node:path';
import { createJavascriptContext, createJavascriptStateContext, runResource } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../resources/apps/mcp-framework/register.js');

describe('apps/mcp-framework/register', () => {
  it('forwards registration payloads to the registry step', async () => {
    const payload = {
      namespace: 'demo',
      tools: [{ name: 'echo' }],
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

    await runResource({ resource, context });

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
