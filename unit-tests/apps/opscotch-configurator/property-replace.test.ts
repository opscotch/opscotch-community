import path from 'node:path';
import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../resources/apps/opscotch-configurator/property-replace.js');

describe('apps/opscotch-configurator/property-replace', () => {
  it('replaces the configured substring on the configured property', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({ title: 'hello old world', untouched: 'value' }),
      data: {
        property: 'title',
        replace: 'old',
        with: 'new',
      },
    });

    const result = await runResource({ resource, context });

    expect(result.doc.dataSchemaValue).toEqual({
      type: 'object',
      required: ['property', 'replace', 'with'],
      properties: {
        property: {
          type: 'string',
          description: 'Property to change',
        },
        replace: {
          type: 'string',
          description: 'search for this',
        },
        with: {
          type: 'string',
          description: 'replace with this',
        },
      },
    });
    expect(context.getBody()).toBe(JSON.stringify({ title: 'hello new world', untouched: 'value' }));
  });
});
