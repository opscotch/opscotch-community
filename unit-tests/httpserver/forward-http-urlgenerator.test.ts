import path from 'node:path';
import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../resources/httpserver/forward-http-urlgenerator.js');

describe('forward-http-urlgenerator', () => {
  it('prepares the outbound url and persists request details for the payload generator', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        method: 'POST',
        path: '/submit',
        queryString: 'x=1',
        headers: {
          Accept: 'application/json',
        },
        body: 'payload',
      }),
    });

    await runResource({ resource, context });

    expect(context.__url).toEqual({
      hostRef: 'target-server',
      path: '/submit?x=1',
    });
    expect(context.__method).toBe('POST');
    expect(context.getProperty('method')).toBe('POST');
    expect(context.getProperty('uri')).toBe('/submit');
    expect(context.getProperty('queryString')).toBe('x=1');
  });
});
