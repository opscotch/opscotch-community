import path from 'node:path';
import { createJavascriptContext, createJavascriptStateContext, runResource } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../resources/apps/mcp-framework/resources-list.js');

describe('apps/mcp-framework/resources-list', () => {
  it('returns resource descriptors from the registry', async () => {
    const context = createJavascriptContext({
      sendToStep(call) {
        if (call.stepName === 'registry') {
          return createJavascriptStateContext({
            body: JSON.stringify({
              ok: true,
              result: {
                resources: [
                  {
                    uri: 'demo://resource',
                    name: 'Demo Resource',
                    description: 'Example',
                    mimeType: 'text/plain',
                  },
                ],
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
        resources: [
          {
            uri: 'demo://resource',
            name: 'Demo Resource',
            description: 'Example',
            mimeType: 'text/plain',
          },
        ],
      },
    }));
  });
});
