import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../resources/general/standard-forward-on-value.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('standard-forward-on-value', () => {
  it('forwards to the route mapped from the selected body field', async () => {
    const context = createJavascriptContext({
      body: '{"colour":"blue"}',
      data: {
        useField: 'colour',
        forwardOnValue: {
          blue: 'the-story-ends',
          _default: 'default-step',
        },
      },
    });

    await suite.run("resource", { context });

    expect(context.__sendToStepCalls[0]).toEqual({
      stepName: 'the-story-ends',
      body: '{"colour":"blue"}',
      headers: undefined,
    });
  });
});
