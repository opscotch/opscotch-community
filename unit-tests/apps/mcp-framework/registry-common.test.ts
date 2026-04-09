import path from 'node:path';
import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../resources/apps/mcp-framework/registry-common.js');

function createStepPropsStore(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    get(key: string) {
      return store.get(key) ?? null;
    },
    put(key: string, value: string) {
      store.set(key, value);
    },
  };
}

describe('apps/mcp-framework/registry-common', () => {
  it('registers namespace data and lists stored tools from step properties', async () => {
    const stepProps = createStepPropsStore();
    const registerContext = createJavascriptContext({
      passedMessage: JSON.stringify({
        action: 'register',
        payload: {
          namespace: 'demo',
          tools: [
            {
              name: 'echo',
              title: 'Echo',
              description: 'Echo tool',
              handler: {
                deploymentAccessId: '_test_',
                stepId: 'echo-step',
              },
            },
          ],
        },
      }),
    });
    registerContext.getStepProperties = () => stepProps as any;

    await runResource({ resource, context: registerContext });

    expect(registerContext.getBody()).toBe(JSON.stringify({
      ok: true,
      result: {
        namespace: 'demo',
        replaced: false,
        registeredCounts: {
          tools: 1,
          resources: 0,
          prompts: 0,
        },
      },
    }));

    const listContext = createJavascriptContext({
      passedMessage: JSON.stringify({
        action: 'list-tools',
      }),
    });
    listContext.getStepProperties = () => stepProps as any;

    await runResource({ resource, context: listContext });

    expect(listContext.getBody()).toBe(JSON.stringify({
      ok: true,
      result: {
        tools: [
          {
            kind: 'tool',
            namespace: 'demo',
            localName: 'echo',
            name: 'demo_echo',
            title: 'Echo',
            description: 'Echo tool',
            inputSchema: {
              type: 'object',
              properties: {},
            },
            handler: {
              deploymentAccessId: '_test_',
              stepId: 'echo-step',
            },
          },
        ],
      },
    }));
  });
});
