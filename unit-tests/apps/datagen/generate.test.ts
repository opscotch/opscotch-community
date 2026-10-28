import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../../resources/apps/datagen/generate.js');

const suite = createResourceSuite({
  resources: [{ id: 'resource', resource }],
});

describe('apps/datagen/generate', () => {
  it('builds a 100-line POST body of random lines', async () => {
    const context = createJavascriptContext({
      data: { batchSize: '50' },
    });

    await suite.run('resource', { context });

    expect(context.__method).toBe('POST');
    expect(context.getBody()?.split('\n')).toHaveLength(100);
  });
});
