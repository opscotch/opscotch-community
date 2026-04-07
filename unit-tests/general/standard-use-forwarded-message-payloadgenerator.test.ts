import path from 'node:path';
import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../resources/general/standard-use-forwarded-message-payloadgenerator.js');

describe('standard-use-forwarded-message-payloadgenerator', () => {
  it('acts as a no-op payload generator', async () => {
    const context = createJavascriptContext({
      body: 'payload',
      passedMessage: 'forwarded',
    });

    await runResource({ resource, context });

    expect(context.getBody()).toBe('payload');
    expect(context.getPassedMessageAsString()).toBe('forwarded');
  });
});
