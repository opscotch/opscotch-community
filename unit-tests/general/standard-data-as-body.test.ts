import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../resources/general/standard-data-as-body.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('standard-data-as-body', () => {
  it('sets the selected data value as the message body', async () => {
    const context = createJavascriptContext({
      data: {
        keyOfBody: 'myBody',
        myBody: { answer: 42 },
      },
    });

    await suite.run("resource", { context });

    expect(context.getBody()).toBe('{"answer":42}');
  });
});
