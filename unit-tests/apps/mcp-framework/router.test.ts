import path from 'node:path';
import { createJavascriptContext, createJavascriptStateContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../resources/apps/mcp-framework/router.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('apps/mcp-framework/router', () => {
  it('routes a JSON-RPC ping request and returns a JSON-RPC result envelope', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 7,
        method: 'ping',
      }),
      properties: {
        mcp_http_event: JSON.stringify({
          method: 'POST',
          headers: {
            origin: 'http://localhost:3000',
          },
        }),
      },
      sendToStep(call) {
        if (call.stepName === 'ping') {
          return createJavascriptStateContext({
            body: JSON.stringify({
              ok: true,
              result: {},
            }),
          });
        }
      },
    });

    await suite.run("resource", { context });

    expect(context.getProperty('status_code')).toBe(200);
    expect(context.getHeader('content-type')).toBe('application/json');
    expect(context.__ended).toBe(true);
    expect(context.getBody()).toBe(JSON.stringify({
      jsonrpc: '2.0',
      id: 7,
      result: {},
    }));
  });
});
