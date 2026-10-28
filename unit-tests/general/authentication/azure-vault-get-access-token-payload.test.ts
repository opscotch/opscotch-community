import path from 'node:path';
import { createAuthenticationJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../../resources/general/authentication/azure-vault-get-access-token-payload.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('authentication/azure-vault-get-access-token-payload', () => {
  it('sets the vault secret as the message body', async () => {
    const context = createAuthenticationJavascriptContext({
      properties: {
        OPSCOTCH_AUTH_DATA: JSON.stringify({ azureVaultHost: 'azure-vault' }),
      },
      restrictedData: {
        'azure-vault': JSON.stringify({ secret: 'app-reg-secret' }),
      },
    });

    await suite.run("resource", { context });

    expect(context.getBody()).toBe('app-reg-secret');
  });

  it('throws when secret is missing from restricted data', async () => {
    const context = createAuthenticationJavascriptContext({
      properties: {
        OPSCOTCH_AUTH_DATA: JSON.stringify({ azureVaultHost: 'azure-vault' }),
      },
      restrictedData: {
        'azure-vault': JSON.stringify({}),
      },
    });

    await expect(suite.run("resource", { context })).rejects.toThrow(/secret not found/);
  });
});
