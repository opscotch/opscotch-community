import path from 'node:path';
import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../resources/general/standard-forwarder.js');

describe('standard-forwarder', () => {
  it('forwards the current message body to the configured route', async () => {
    const context = createJavascriptContext({
      body: '{"item":1}',
      data: { processroute: 'sink-step' },
    });

    await runResource({ resource, context });

    expect(context.__sendToStepCalls[0]).toEqual({
      stepName: 'sink-step',
      body: '{"item":1}',
      headers: undefined,
    });
  });
});
