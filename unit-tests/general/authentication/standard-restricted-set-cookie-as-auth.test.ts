import path from 'node:path';
import { createAuthenticationJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../../resources/general/authentication/standard-restricted-set-cookie-as-auth.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

type AuthContext = ReturnType<typeof createAuthenticationJavascriptContext> & {
  getAuthenticationPropertiesFromStep(stepId: string, key: string): string | null;
};

describe('authentication/standard-restricted-set-cookie-as-auth', () => {
  it('extracts named cookies from Set-Cookie and stores them as auth properties', async () => {
    const context = createAuthenticationJavascriptContext({
      data: {
        cookies: ['COOKIE1', 'COOKIE2'],
        authPropertiesStep: 'cookie-auth-step',
        cookiesPropertyName: 'cookies',
      },
      headers: {
        'Set-Cookie': '["COOKIE1=a; path=/","COOKIE2=b; path=/","OTHER=x; path=/"]',
      },
    }) as AuthContext;

    await suite.run("resource", { context });

    expect(JSON.parse(context.getAuthenticationPropertiesFromStep('cookie-auth-step', 'cookies')!)).toEqual({
      Cookie: 'COOKIE1=a; COOKIE2=b; ',
    });
  });
});
