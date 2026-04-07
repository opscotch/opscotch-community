import path from 'node:path';
import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../resources/general/standard-newline-aggregator-split.js');

describe('standard-newline-aggregator-split', () => {
  it('splits newline-delimited content into split items', async () => {
    const context = createJavascriptContext({
      body: 'one\ntwo\nthree',
    });

    await runResource({ resource, context });

    expect(context.__splitReturnItems).toEqual(['one', 'two', 'three']);
  });
});
