import path from 'node:path';
import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../resources/general/standard-data-as-body.js');

describe('standard-data-as-body', () => {
  it('sets the selected data value as the message body', async () => {
    const context = createJavascriptContext({
      data: {
        keyOfBody: 'myBody',
        myBody: { answer: 42 },
      },
    });

    await runResource({ resource, context });

    expect(context.getBody()).toBe('{"answer":42}');
  });
});
