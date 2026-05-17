import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../resources/general/standard-encode-url-generator.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('standard-encode-url-generator', () => {
  it('url encodes the query and sets the target url', async () => {
    const context = createJavascriptContext({
      data: {
        path: '/search?q=',
        query: 'meaning of life',
        'host-ref': 'splunk',
      },
    });

    await suite.run("resource", { context });

    expect(context.__url).toEqual({
      hostRef: 'splunk',
      path: '/search?q=meaning%20of%20life',
    });
  });
});
