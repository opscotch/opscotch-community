import path from 'node:path';
import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../resources/tests-only/emptyfile.js');

describe('tests-only/emptyfile', () => {
  it('runs without changing the context', async () => {
    const context = createJavascriptContext({
      body: 'keep-me',
    });

    await runResource({ resource, context });

    expect(context.getBody()).toBe('keep-me');
  });
});
