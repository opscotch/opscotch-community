import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../resources/general/standard-forward-from-headers.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('standard-forward-from-headers', () => {
  it('forwards the body to a route resolved from data and copies configured headers', async () => {
    const context = createJavascriptContext({
      body: '{"hello":"world"}',
      headers: {
        'X-Trace': '["trace-1"]',
      },
      data: {
        headersToCopy: ['X-Trace'],
        processrouteData: 'next-step',
      },
    });

    await suite.run("resource", { context });

    expect(context.__sendToStepCalls).toEqual([
      {
        stepName: 'next-step',
        body: '{"hello":"world"}',
        headers: { 'X-Trace': 'trace-1' },
      },
    ]);
  });
});
