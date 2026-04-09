import path from 'node:path';
import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../resources/apps/opscotch-configurator/difffile.js');

describe('apps/opscotch-configurator/difffile', () => {
  it('diffs JSON file contents against the request body', async () => {
    const reads: string[] = [];
    const context = createJavascriptContext({
      body: JSON.stringify({
        path: '/tmp/example.json',
        body: JSON.stringify({ name: 'updated', keep: true, added: 1 }),
      }),
      data: { fileId: 'config-files' },
      files: {
        read(path: string) {
          reads.push(path);
          return JSON.stringify({ name: 'original', keep: true, removed: 2 });
        },
      },
    });

    await runResource({ resource, context });

    expect(reads).toEqual(['/tmp/example.json']);
    expect(context.getBody()).toBe(JSON.stringify([
      { path: 'name', type: 'modified' },
      { path: 'removed', type: 'deleted' },
      { path: 'added', type: 'added' },
    ]));
  });

  it('returns an unsupported diff for non-JSON file contents', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        path: '/tmp/example.txt',
        body: 'replacement text',
      }),
      data: { fileId: 'config-files' },
      files: {
        read() {
          return 'plain text file';
        },
      },
    });

    const result = await runResource({ resource, context });

    expect(result.doc.dataSchemaValue).toEqual({
      type: 'object',
      required: ['fileId'],
      properties: {
        fileId: {
          type: 'string',
        },
      },
    });
    expect(context.getBody()).toBe(JSON.stringify([
      { type: 'unsupported', path: 'Non JSON file diff is not currently supported' },
    ]));
  });
});
