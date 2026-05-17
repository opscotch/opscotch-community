import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../../resources/apps/openclaw/invoke-payload-generator.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('apps/openclaw invoke-payload-generator', () => {
  it('passes through generic input/metadata payload', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        agent: 'reviewer',
        input: { repo: 'opscotch/hopscotch', issue: 317 },
        metadata: { operation: 'refine' },
      }),
    });

    await suite.run("resource", { context });

    expect(JSON.parse(context.getBody() || '{}')).toEqual({
      input: { repo: 'opscotch/hopscotch', issue: 317 },
      metadata: { operation: 'refine' },
    });
  });

  it('passes through input-only payload without defaults', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        input: { repo: 'opscotch/hopscotch', issue: 317 },
      }),
    });

    await suite.run("resource", { context });

    expect(JSON.parse(context.getBody() || '{}')).toEqual({
      input: { repo: 'opscotch/hopscotch', issue: 317 },
    });
  });
});
