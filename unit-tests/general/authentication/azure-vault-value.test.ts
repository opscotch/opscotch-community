import path from 'node:path';
import { createAuthenticationJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../../resources/general/authentication/azure-vault-value.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

type AuthContext = ReturnType<typeof createAuthenticationJavascriptContext> & {
  getAuthenticationPropertiesFromStep(stepId: string, key: string): string | null;
};

describe('authentication/azure-vault-value', () => {
  it('stores the vault value on the auth step property', async () => {
    const context = createAuthenticationJavascriptContext({
      body: JSON.stringify({ value: 'yesplease!' }),
      properties: {
        OPSCOTCH_AUTH_DATA: JSON.stringify({
          propertiesStoredOnStep: 'myAuthingStep',
          propertyName: 'myAuthProperties',
          propertyAzureVaultValueKeyName: 'myProperty',
        }),
      },
    }) as AuthContext;

    await suite.run("resource", { context });

    expect(JSON.parse(context.getAuthenticationPropertiesFromStep('myAuthingStep', 'myAuthProperties')!)).toEqual({
      myProperty: 'yesplease!',
    });
  });
});
