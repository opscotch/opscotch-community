import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../resources/apps/opscotch-configurator/readfile.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('apps/opscotch-configurator/readfile', () => {
  it('declares the fileId data schema dependency', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({ path: '/tmp/example.txt' }),
      data: { fileId: 'config-files' },
      files: {
        read() {
          return 'hello';
        },
      },
    });
    const result = await suite.run("resource", { context });

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

    await suite.run("resource", { context });

    expect(context.getBody()).toBe('hello world');
    expect(reads).toEqual([{ path: '/tmp/example.txt' }]);
  });
});
