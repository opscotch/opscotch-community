import path from 'node:path';
import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../resources/apps/mcp-framework/example-echo.js');

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

    await runResource({ resource, context });

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
