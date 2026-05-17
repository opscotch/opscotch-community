import path from 'node:path';
import { createAuthenticationJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../../resources/apps/github/github-auth-processor.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('github-auth-processor', () => {
  it('sets bearer authorization from restricted host data', async () => {
    const context = createAuthenticationJavascriptContext({
      data: { githubAuthHostId: 'github-api' },
      restrictedData: {
        'github-api': JSON.stringify({ githubToken: 'secret-token' }),
      },
    });

    await suite.run("resource", { context });

    expect(context.getHeader('authorization')).toBe('Bearer secret-token');
  });

  it('records system error when token is missing', async () => {
    const context = createAuthenticationJavascriptContext({
      data: { githubAuthHostId: 'github-api' },
      restrictedData: {
        'github-api': JSON.stringify({}),
      },
    });

    await suite.run("resource", { context });

    expect(context.hasSystemErrors()).toBe(true);
    expect(context.getSystemErrors().join(' ')).toContain('github token is missing');
    expect(context.__ended).toBe(true);
  });
});
