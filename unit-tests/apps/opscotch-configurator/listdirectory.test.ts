import path from 'node:path';
import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../resources/apps/opscotch-configurator/listdirectory.js');

describe('apps/opscotch-configurator/listdirectory', () => {
  it('lists the configured directory and returns the filesystem result', async () => {
    const listedPaths: string[] = [];
    const listing = JSON.stringify([
      { name: 'first.txt', type: 'FILE' },
      { name: 'nested', type: 'DIRECTORY' },
    ]);
    const context = createJavascriptContext({
      body: JSON.stringify({ uri: '/api/list', method: 'GET', path: '/tmp' }),
      data: { fileId: 'config-files' },
      files: {
        list(path: string) {
          listedPaths.push(path);
          return listing;
        },
      },
    });

    const result = await runResource({ resource, context });

    expect(result.doc.dataSchemaValue).toEqual({
      type: 'object',
      properties: {
        fileId: {
          type: 'string',
        },
      },
    });
    expect(result.doc.outSchemaValue).toEqual({
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
          },
          type: {
            type: 'string',
          },
        },
      },
    });
    expect(listedPaths).toEqual(['/tmp', '/tmp']);
    expect(context.getBody()).toBe(listing);
  });
});
