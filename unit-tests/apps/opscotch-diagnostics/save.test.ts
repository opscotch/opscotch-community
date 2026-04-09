import path from 'node:path';
import {
  createByteContext,
  createJavascriptContext,
  runResource,
  type ByteBufferHandle,
  type ByteContextRuntime,
} from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../resources/apps/opscotch-diagnostics/save.js');

function createCompatibleByteContext(): ByteContextRuntime & {
  createFrom(value: string | number[] | Uint8Array): ByteBufferHandle;
} {
  const bytes = createByteContext();
  return {
    ...bytes,
    createFrom(value) {
      if (typeof value === 'string') {
        return bytes.createFromString(value);
      }
      return bytes.createFromByteArray(value);
    },
  };
}

function readLengthPrefixedPayload(bytes: ByteContextRuntime, blob: ByteBufferHandle): string {
  const reader = bytes.reader(blob);
  const byteCount = bytes.readByte(reader.read(1), 0);
  const lengthBytes = reader.read(byteCount);
  const length = Array.from({ length: byteCount }, (_, i) => bytes.readByte(lengthBytes, i) << (i * 8))
    .reduce((sum, value) => sum | value, 0);
  const compressed = reader.read(length);
  return bytes.toString(bytes.gunzip(compressed));
}

describe('apps/opscotch-diagnostics/save', () => {
  it('queues and forwards payloads when triggered with a body', async () => {
    const pushed: string[] = [];
    const queue = {
      push(payload: string) {
        pushed.push(payload);
      },
      take() {
        return [];
      },
    };
    const context = createJavascriptContext({
      body: '{"payload":true}',
      data: { forwardingHost: 'enabled' },
      queue,
    });

    await runResource({ resource, context });

    expect(pushed).toEqual(['{"payload":true}']);
    expect(context.__sendToStepAndForgetCalls).toEqual([
      { stepName: 'forward', body: '{"payload":true}', headers: undefined },
    ]);
    expect(context.__ended).toBe(true);
  });

  it('writes queued payloads to the latest diagnostics file as a framed gzip blob', async () => {
    const bytes = createCompatibleByteContext();
    const writes: Array<{ file: string; blob: ByteBufferHandle; offset: number }> = [];
    const queueItems = ['first payload'];
    const files = {
      list() {
        return JSON.stringify([
          { type: 'FILE', name: 'older', bytes: 10, modified: 1 },
          { type: 'FILE', name: 'latest', bytes: 42, modified: 2 },
        ]);
      },
      writeBinary(file: string, blob: ByteBufferHandle, offset: number) {
        writes.push({ file, blob, offset });
      },
    };
    const queue = {
      push() {},
      take() {
        if (queueItems.length === 0) {
          return [];
        }
        return [queueItems.shift()];
      },
    };
    const context = createJavascriptContext({
      byteContext: bytes,
      queue,
      files,
    });

    await runResource({ resource, context });

    expect(writes).toHaveLength(1);
    expect(writes[0]?.file).toBe('latest');
    expect(writes[0]?.offset).toBe(42);
    expect(readLengthPrefixedPayload(bytes, writes[0]!.blob)).toBe('first payload');
    expect(context.__logs).toContain('processing from queue');
    expect(context.__logs).toContain('writing');
    expect(context.__logs).toContain('done');
  });
});
