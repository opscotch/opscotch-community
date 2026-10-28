import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(
  import.meta.dirname,
  '../../../resources/elastic/query/elastic-update-urlgenerator.js',
);

const suite = createResourceSuite({
  resources: [{ id: 'resource', resource }],
});

describe('elastic/query/elastic-update-urlgenerator', () => {
  it('sets update url and POST method from idproperty', async () => {
    const context = createJavascriptContext({
      data: {
        'host-ref': 'elastic-host',
        index: 'my-index',
        idproperty: 'docId',
      },
      properties: { docId: 'abc-123' },
    });

    await suite.run('resource', { context });

    expect(context.__url).toEqual({
      hostRef: 'elastic-host',
      path: '/my-index/_update/abc-123',
    });
    expect(context.__method).toBe('POST');
  });

  it('falls back to idheader when idproperty is absent', async () => {
    const context = createJavascriptContext({
      data: {
        'host-ref': 'elastic-host',
        index: 'logs',
        idheader: 'ids',
      },
      headers: { ids: JSON.stringify(['hdr-9']) },
    });

    await suite.run('resource', { context });

    expect(context.__url).toEqual({
      hostRef: 'elastic-host',
      path: '/logs/_update/hdr-9',
    });
    expect(context.__method).toBe('POST');
  });
});
