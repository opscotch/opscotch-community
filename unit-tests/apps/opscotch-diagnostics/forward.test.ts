import path from 'node:path';
import { createJavascriptContext, createJavascriptStateContext, runResource } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../../resources/apps/opscotch-diagnostics/forward.js');

describe('apps/opscotch-diagnostics/forward', () => {
  it('pushes payloads into the queue and ends when a body is present', async () => {
    const pushed: string[] = [];
    const queue = {
      push(payload: string) {
        pushed.push(payload);
      },
      take() {
        return [];
      },
      returnItem() {},
    };
    const context = createJavascriptContext({
      body: '{"payload":true}',
      queue,
    });

    await runResource({ resource, context });

    expect(pushed).toEqual(['{"payload":true}']);
    expect(context.__ended).toBe(true);
  });

  it('forwards queued payloads when triggered without a body', async () => {
    const queueItems = ['one', 'two'];
    const returned: string[] = [];
    const queue = {
      push() {},
      take() {
        if (queueItems.length === 0) {
          return [];
        }
        return [queueItems.shift()];
      },
      returnItem(payload: string) {
        returned.push(payload);
      },
    };
    const context = createJavascriptContext({
      queue,
      sendToStep: () => createJavascriptStateContext(),
    });

    await runResource({ resource, context });

    expect(context.__sendToStepCalls).toEqual([
      { stepName: 'forwarder', body: 'one', headers: undefined },
      { stepName: 'forwarder', body: 'two', headers: undefined },
    ]);
    expect(returned).toEqual([]);
  });
});
