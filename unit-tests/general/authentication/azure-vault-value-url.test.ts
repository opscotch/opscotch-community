import path from 'node:path';
import { createAuthenticationJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../../resources/general/authentication/azure-vault-value-url.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('authentication/azure-vault-value-url', () => {
  it('sets the vault value fetch url from OPSCOTCH_AUTH_DATA', async () => {
    const context = createAuthenticationJavascriptContext({
      properties: {
        OPSCOTCH_AUTH_DATA: JSON.stringify({
          azureVaultFetchHost: 'azure-vault-fetch',
          azureVaultValueName: 'puppy',
        }),
      },
    });

    await suite.run("resource", { context });

    expect(context.__url).toEqual({
      hostRef: 'azure-vault-fetch',
      path: '/puppy/?api-version=2016-10-01',
    });
  });

  it('resolves value name from restricted host data when configured', async () => {
    const context = createAuthenticationJavascriptContext({
      properties: {
        OPSCOTCH_AUTH_DATA: JSON.stringify({
          azureVaultFetchHost: 'azure-vault-fetch',
          azureVaultValueName: 'unused',
          azureVaultValueNameRestricted: 'secretName',
        }),
      },
      restrictedData: {
        'azure-vault-fetch': JSON.stringify({ secretName: 'resolved-secret' }),
      },
    });

    await suite.run("resource", { context });

    expect(context.__url).toEqual({
      hostRef: 'azure-vault-fetch',
      path: '/resolved-secret/?api-version=2016-10-01',
    });
  });
});
