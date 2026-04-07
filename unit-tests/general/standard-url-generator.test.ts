import path from 'node:path';
import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../resources/general/standard-url-generator.js');

describe('standard-url-generator', () => {
  it('sets the target host, path, and http method', async () => {
    const context = createJavascriptContext({
      data: {
        'host-ref': 'service-a',
        path: '/health',
        method: 'get',
      },
    });

    await runResource({ resource, context });

    expect(context.__url).toEqual({ hostRef: 'service-a', path: '/health' });
    expect(context.__method).toBe('GET');
  });
});
