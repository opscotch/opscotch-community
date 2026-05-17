import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../resources/general/standard-body-as-property.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('standard-body-as-property', () => {
  it('stores the current body in the configured property', async () => {
    const context = createJavascriptContext({
      body: '{"ok":true}',
      data: { propertyName: 'savedBody' },
    });

    await suite.run("resource", { context });

    expect(context.getProperty('savedBody')).toBe('{"ok":true}');
  });
});
