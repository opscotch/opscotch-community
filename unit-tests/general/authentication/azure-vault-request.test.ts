import path from 'node:path';
import { createAuthenticationJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../../resources/general/authentication/azure-vault-request.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('authentication/azure-vault-request', () => {
  it('sets Authorization header from the passed token response', async () => {
    const context = createAuthenticationJavascriptContext({
      passedMessage: JSON.stringify({
        token_type: 'Bearer',
        access_token: 'eyJhbGciOiJIUzI1NiJ9.token',
      }),
    });

    await suite.run("resource", { context });

    expect(context.getHeader('Authorization')).toBe('Bearer eyJhbGciOiJIUzI1NiJ9.token');
  });
});
