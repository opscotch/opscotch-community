import path from 'node:path';
import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../resources/httpserver/forward-http-payloadgenerator.js');

describe('forward-http-payloadgenerator', () => {
  it('restores headers and decodes a base64 body from the saved request', async () => {
    const context = createJavascriptContext({
      properties: {
        forward_http_request: JSON.stringify({
          headers: {
            'Content-Type': 'text/plain',
          },
          body: 'aGVsbG8=',
          isBase64Encoded: true,
        }),
        uri: '/test',
        queryString: '',
        method: 'POST',
      },
    });

    await runResource({ resource, context });

    expect(context.getHeader('Content-Type')).toBe('text/plain');
    expect(context.getBody()).toBe('hello');
  });
});
