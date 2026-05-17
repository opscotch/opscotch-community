import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../resources/apps/mcp-framework/example-echo.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('apps/mcp-framework/example-echo', () => {
  it('returns echoed tool content from the passed message', async () => {
    const context = createJavascriptContext({
      passedMessage: JSON.stringify({
        name: 'echo',
        namespace: 'demo',
        arguments: { text: 'hello' },
        tool: {},
      }),
    });

    await suite.run("resource", { context });

    expect(context.getBody()).toBe(JSON.stringify({
      content: [{ type: 'text', text: 'sample echo: hello' }],
      structuredContent: {
        echoedText: 'hello',
        namespace: 'demo',
        tool: 'echo',
      },
    }));
  });
});
