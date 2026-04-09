import path from 'node:path';
import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../resources/apps/opscotch-configurator/writefile.js');

describe('apps/opscotch-configurator/writefile', () => {
  it('declares the fileId data schema dependency', async () => {
    const result = await runResource({
      resource,
      context: createJavascriptContext({
        body: JSON.stringify({ path: '/tmp/example.txt', body: 'hello' }),
        data: { fileId: 'config-files' },
        files: {
          write() {},
        },
      }),
    });

    expect(result.doc.dataSchemaValue).toEqual({
      type: 'object',
      required: ['fileId'],
      properties: {
        fileId: {
          type: 'string',
        },
      },
    });
  });

  it('writes the request body to the configured file target and sets the body', async () => {
    const writes: Array<{ fileId: string; path: string; body: string }> = [];
    const context = createJavascriptContext({
      body: JSON.stringify({ path: '/tmp/example.txt', body: 'hello world' }),
      data: { fileId: 'config-files' },
      files: {
        write(path: string, body: string) {
          writes.push({ fileId: 'config-files', path, body });
        },
      },
    });

    await runResource({ resource, context });

    expect(context.getBody()).toBe('hello world');
    expect(writes).toEqual([
      { fileId: 'config-files', path: '/tmp/example.txt', body: 'hello world' },
    ]);
  });
});
