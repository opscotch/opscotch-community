import path from 'node:path';
import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../resources/httpserver/response-set-cors.js');

describe('response-set-cors', () => {
  it('sets a default cors header when no data override is present', async () => {
    const context = createJavascriptContext();

    await runResource({ resource, context });

    expect(context.getHeader('Access-Control-Allow-Origin')).toBe('*');
  });

  it('sets configured headers when addHeaders is provided', async () => {
    const context = createJavascriptContext({
      data: {
        addHeaders: ['Access-Control-Allow-Origin', 'Access-Control-Allow-Methods'],
        'Access-Control-Allow-Origin': 'https://example.test',
        'Access-Control-Allow-Methods': 'GET,POST',
      },
    });

    await runResource({ resource, context });

    expect(context.getHeader('Access-Control-Allow-Origin')).toBe('https://example.test');
    expect(context.getHeader('Access-Control-Allow-Methods')).toBe('GET,POST');
  });
});
