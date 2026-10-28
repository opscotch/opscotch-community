import path from 'node:path';
import { createAuthenticationJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../resources/o365/setAccessAndRefreshToken.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

type AuthContext = ReturnType<typeof createAuthenticationJavascriptContext> & {
  getAuthenticationPropertiesFromStep(stepId: string, key: string): string | null;
};

describe('o365/setAccessAndRefreshToken', () => {
  it('persists the refresh token and stores access token auth properties', async () => {
    const context = createAuthenticationJavascriptContext({
      body: JSON.stringify({
        token_type: 'Bearer',
        expires_in: 3614,
        access_token: 'access-xyz',
        refresh_token: 'refresh-xyz',
      }),
      data: {
        propertiesStoredOnStep: 'o365-auth-step',
        propertyName: 'Authorization',
      },
    }) as AuthContext;

    await suite.run("resource", { context });

    expect(context.getPersistedItem('refreshToken')).toBe('refresh-xyz');
    expect(JSON.parse(context.getAuthenticationPropertiesFromStep('o365-auth-step', 'Authorization')!)).toEqual({
      Authorization: 'access-xyz',
    });
  });
});
