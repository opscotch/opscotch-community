import path from 'node:path';
import { createAuthenticationJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../../resources/general/authentication/standard-restricted-data-as-auth.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

type AuthContext = ReturnType<typeof createAuthenticationJavascriptContext> & {
  getAuthenticationPropertiesFromStep(stepId: string, key: string): string | null;
};

describe('authentication/standard-restricted-data-as-auth', () => {
  it('stores a single restricted value as an authentication property', async () => {
    const context = createAuthenticationJavascriptContext({
      data: {
        fromHost: 'theHost',
        keyOfValue: 'myBody',
        headerName: 'myHeader',
        propertiesStoredOnStep: 'auth-appd-basic',
        propertyName: 'Authorization',
      },
      restrictedData: {
        theHost: JSON.stringify({ myBody: 'this is the body' }),
      },
    }) as AuthContext;

    await suite.run("resource", { context });

    expect(JSON.parse(context.getAuthenticationPropertiesFromStep('auth-appd-basic', 'Authorization')!)).toEqual({
      myHeader: 'this is the body',
    });
  });
});
