import path from 'node:path';
import { createAuthenticationJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../../resources/general/authentication/standard-restricted-data-as-header.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('authentication/standard-restricted-data-as-header', () => {
  it('sets a header from restricted host data', async () => {
    const context = createAuthenticationJavascriptContext({
      data: {
        fromHost: 'theHost',
        keyOfValue: 'myBody',
        headerName: 'myHeader',
      },
      restrictedData: {
        theHost: JSON.stringify({ myBody: 'this is the body' }),
      },
    });

    await suite.run("resource", { context });

    expect(context.getHeader('myHeader')).toBe('this is the body');
  });
});
