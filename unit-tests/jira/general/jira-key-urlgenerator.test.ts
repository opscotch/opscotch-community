import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../../resources/jira/general/jira-key-urlgenerator.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('jira/general/jira-key-urlgenerator', () => {
  it('replaces {key} in the path with the key from the body', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({ key: 'ABC-12345' }),
      data: {
        'host-ref': 'jira',
        path: '/rest/api/2/issue/{key}',
      },
    });

    await suite.run("resource", { context });

    expect(context.__url).toEqual({
      hostRef: 'jira',
      path: '/rest/api/2/issue/ABC-12345',
    });
  });
});
