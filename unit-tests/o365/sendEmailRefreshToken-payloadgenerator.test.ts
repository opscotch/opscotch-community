import path from 'node:path';
import { createAuthenticationJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../resources/o365/sendEmailRefreshToken-payloadgenerator.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('o365/sendEmailRefreshToken-payloadgenerator', () => {
  it('builds refresh-token form body from restricted host data', async () => {
    const context = createAuthenticationJavascriptContext({
      data: { 'host-ref': 'o365' },
      restrictedData: {
        o365: JSON.stringify({
          o365SendEmailClientId: 'client-123',
          o365SendEmailRefreshToken: 'refresh-abc',
        }),
      },
    });

    await suite.run("resource", { context });

    expect(context.getHeader('Content-Type')).toBe('application/x-www-form-urlencoded');
    expect(context.getBody()).toBe(
      'scope=https%3A%2F%2Fgraph.microsoft.com%2Fmail.send+offline_access&grant_type=refresh_token&client_id=client-123&refresh_token=refresh-abc',
    );
  });

  it('prefers a persisted refresh token when present', async () => {
    const context = createAuthenticationJavascriptContext({
      data: { 'host-ref': 'o365' },
      restrictedData: {
        o365: JSON.stringify({
          o365SendEmailClientId: 'client-123',
          o365SendEmailRefreshToken: 'refresh-abc',
        }),
      },
      persistedItems: {
        refreshToken: 'persisted-refresh',
      },
    });

    await suite.run("resource", { context });

    expect(context.getBody()).toContain('refresh_token=persisted-refresh');
  });
});
