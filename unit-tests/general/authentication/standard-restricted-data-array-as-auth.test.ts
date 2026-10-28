import path from 'node:path';
import { createAuthenticationJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../../resources/general/authentication/standard-restricted-data-array-as-auth.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

type AuthContext = ReturnType<typeof createAuthenticationJavascriptContext> & {
  getAuthenticationPropertiesFromStep(stepId: string, key: string): string | null;
};

describe('authentication/standard-restricted-data-array-as-auth', () => {
  it('maps multiple restricted values onto authentication properties', async () => {
    const context = createAuthenticationJavascriptContext({
      data: {
        fromHost: 'theHost',
        authValues: [
          { keyOfValue: 'auth1', headerName: 'auth1' },
          { keyOfValue: 'auth2', headerName: 'auth2' },
        ],
        propertiesStoredOnStep: 'auth-appd-basic',
        propertyName: 'Authorization',
      },
      restrictedData: {
        theHost: JSON.stringify({ auth1: 'this is the head', auth2: 'this is the leg' }),
      },
    }) as AuthContext;

    await suite.run("resource", { context });

    expect(JSON.parse(context.getAuthenticationPropertiesFromStep('auth-appd-basic', 'Authorization')!)).toEqual({
      auth1: 'this is the head',
      auth2: 'this is the leg',
    });
  });
});
