import path from 'node:path';
import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../resources/general/standard-json-resultsprocessor.js');

describe('standard-json-resultsprocessor', () => {
  it('aggregates configured values and sends metrics', async () => {
    const context = createJavascriptContext({
      body: '[{"nested":{"item":{"number_of_nodes":2}}},{"nested":{"item":{"number_of_nodes":3}}}]',
      data: {
        prefix: 'elastic-',
        sum: {
          'nested.item.number_of_nodes': 'cluster-nodes',
        },
      },
      timestamp: 1700000000000,
    });

    await runResource({ resource, context });

    expect(context.__metrics).toEqual([
      { args: [1700000000000, 'elastic-cluster-nodes', 5] },
    ]);
  });
});
