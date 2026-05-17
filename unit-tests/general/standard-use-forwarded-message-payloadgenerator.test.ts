import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../resources/general/standard-use-forwarded-message-payloadgenerator.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('standard-use-forwarded-message-payloadgenerator', () => {
  it('acts as a no-op payload generator', async () => {
    const context = createJavascriptContext({
      body: 'payload',
      passedMessage: 'forwarded',
    });

    await suite.run("resource", { context });

    expect(context.getBody()).toBe('payload');
    expect(context.getPassedMessageAsString()).toBe('forwarded');
  });
});
