import path from 'node:path';
import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../resources/general/standard-json-array-aggregator-split.js');

describe('standard-json-array-aggregator-split', () => {
  it('adds each array item as a split return item', async () => {
    const context = createJavascriptContext({
      body: '[{"a":1},{"a":2}]',
    });

    await runResource({ resource, context });

    expect(context.__splitReturnItems).toEqual(['{"a":1}', '{"a":2}']);
  });
});
