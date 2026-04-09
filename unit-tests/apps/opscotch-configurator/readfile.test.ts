import path from 'node:path';
import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../resources/apps/opscotch-configurator/readfile.js');

describe('apps/opscotch-configurator/readfile', () => {
  it('declares the fileId data schema dependency', async () => {
    const result = await runResource({
      resource,
      context: createJavascriptContext({
        body: JSON.stringify({ path: '/tmp/example.txt' }),
        data: { fileId: 'config-files' },
        files: {
          read() {
            return 'hello';
          },
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

  it('reads from the configured file target and sets the message body', async () => {
    const reads: Array<{ path: string }> = [];
    const context = createJavascriptContext({
      body: JSON.stringify({ path: '/tmp/example.txt' }),
      data: { fileId: 'config-files' },
      files: {
        read(path: string) {
          reads.push({ path });
          return 'hello world';
        },
      },
    });

    await runResource({ resource, context });

    expect(context.getBody()).toBe('hello world');
    expect(reads).toEqual([{ path: '/tmp/example.txt' }]);
  });
});
