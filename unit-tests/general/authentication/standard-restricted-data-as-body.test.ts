import path from 'node:path';
import { createAuthenticationJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../../resources/general/authentication/standard-restricted-data-as-body.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('authentication/standard-restricted-data-as-body', () => {
  it('sets the message body from restricted host data', async () => {
    const context = createAuthenticationJavascriptContext({
      data: {
        fromHost: 'theHost',
        keyOfBody: 'myBody',
      },
      restrictedData: {
        theHost: JSON.stringify({ myBody: 'this is the body' }),
      },
    });

    await suite.run("resource", { context });

    expect(context.getBody()).toBe('this is the body');
  });
});
