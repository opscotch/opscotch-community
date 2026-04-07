import path from 'node:path';
import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../resources/general/standard-body-as-property.js');

describe('standard-body-as-property', () => {
  it('stores the current body in the configured property', async () => {
    const context = createJavascriptContext({
      body: '{"ok":true}',
      data: { propertyName: 'savedBody' },
    });

    await runResource({ resource, context });

    expect(context.getProperty('savedBody')).toBe('{"ok":true}');
  });
});
