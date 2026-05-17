import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../resources/general/standard-json-array-item-forwarder.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('standard-json-array-item-forwarder', () => {
  it('forwards each array item to the configured route', async () => {
    const context = createJavascriptContext({
      body: '[{"a":1},{"a":2}]',
      data: { processroute: 'per-item-step' },
    });

    await suite.run("resource", { context });

    expect(context.__sendToStepCalls).toEqual([
      { stepName: 'per-item-step', body: '{"a":1}', headers: undefined },
      { stepName: 'per-item-step', body: '{"a":2}', headers: undefined },
    ]);
  });
});
