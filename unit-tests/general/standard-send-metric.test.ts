import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../resources/general/standard-send-metric.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('standard-send-metric', () => {
  it('sends a metric using the passed message payload', async () => {
    const context = createJavascriptContext({
      passedMessage: '{"metric":"requests","value":12}',
      timestamp: 1700000000000,
    });

    await suite.run("resource", { context });

    expect(context.__metrics).toEqual([
      { args: [1700000000000, 'requests', 12] },
    ]);
  });
});
