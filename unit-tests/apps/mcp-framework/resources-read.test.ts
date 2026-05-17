import path from 'node:path';
import { createJavascriptContext, createJavascriptStateContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../resources/apps/mcp-framework/resources-read.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('apps/mcp-framework/resources-read', () => {
  it('returns static resource contents from the registry lookup', async () => {
    const context = createJavascriptContext({
      passedMessage: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'resources/read',
        params: {
          uri: 'demo://resource',
        },
      }),
      sendToStep(call) {
        if (call.stepName === 'registry') {
          return createJavascriptStateContext({
            body: JSON.stringify({
              ok: true,
              result: {
                resource: {
                  uri: 'demo://resource',
                  mimeType: 'text/plain',
                  source: {
                    type: 'static',
                    text: 'hello world',
                  },
                },
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
        contents: [
          {
            uri: 'demo://resource',
            mimeType: 'text/plain',
            text: 'hello world',
          },
        ],
      },
    }));
  });
});
