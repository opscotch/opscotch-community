import path from 'node:path';
import { createAuthenticationJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../../resources/general/authentication/azure-vault-token-request.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('authentication/azure-vault-token-request', () => {
  it('sets the url from OPSCOTCH_AUTH_DATA azureVaultHost', async () => {
    const context = createAuthenticationJavascriptContext({
      properties: {
        OPSCOTCH_AUTH_DATA: JSON.stringify({ azureVaultHost: 'azure-token-host' }),
      },
    });

    await suite.run("resource", { context });

    expect(context.__url).toEqual({ hostRef: 'azure-token-host', path: '' });
  });
});
