import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../resources/general/standard-url-generator-v2.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('standard-url-generator-v2', () => {
  it('substitutes data and message variables into the url and method', async () => {
    const context = createJavascriptContext({
      data: {
        path: '/users/${userId}/orders/${orderId}',
        'host-ref': 'service-a',
        method: 'post',
        orderId: 'from-data',
      },
      passedMessage: JSON.stringify({ userId: '42' }),
    });

    await suite.run("resource", { context });

    expect(context.__url).toEqual({
      hostRef: 'service-a',
      path: '/users/42/orders/from-data',
    });
    expect(context.__method).toBe('POST');
  });
});
