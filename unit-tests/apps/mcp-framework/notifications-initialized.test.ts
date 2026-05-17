import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../resources/apps/mcp-framework/notifications-initialized.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('apps/mcp-framework/notifications-initialized', () => {
  it('returns an empty success result', async () => {
    const context = createJavascriptContext();

    await suite.run("resource", { context });

    expect(context.getBody()).toBe(JSON.stringify({
      ok: true,
      result: {},
    }));
  });
});
