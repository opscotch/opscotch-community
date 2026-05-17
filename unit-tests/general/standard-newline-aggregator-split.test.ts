import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../resources/general/standard-newline-aggregator-split.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('standard-newline-aggregator-split', () => {
  it('splits newline-delimited content into split items', async () => {
    const context = createJavascriptContext({
      body: 'one\ntwo\nthree',
    });

    await suite.run("resource", { context });

    expect(context.__splitReturnItems).toEqual(['one', 'two', 'three']);
  });
});
