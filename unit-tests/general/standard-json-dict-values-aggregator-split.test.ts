import path from 'node:path';
import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../resources/general/standard-json-dict-values-aggregator-split.js');

describe('standard-json-dict-values-aggregator-split', () => {
  it('splits each value in the configured dictionary path', async () => {
    const context = createJavascriptContext({
      body: '{"some":{"path":{"to":{"dict":{"first":{"a":1},"second":{"a":2}}}}}}',
      data: { path: 'some.path.to.dict' },
    });

    await runResource({ resource, context });

    expect(context.__splitReturnItems).toEqual(['{"a":1}', '{"a":2}']);
  });
});
