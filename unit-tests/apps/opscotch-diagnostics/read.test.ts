import path from 'node:path';
import {
  createByteContext,
  createJavascriptContext,
  runResource,
  type ByteBufferHandle,
} from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../resources/apps/opscotch-diagnostics/read.js');

function writeInt(bytes: ReturnType<typeof createByteContext>, value: number): ByteBufferHandle {
  let byteCount = 1;
  if (value > 255) {
    byteCount = 2;
  }
  if (value > 65535) {
    byteCount = 3;
  }
  if (value > 16777215) {
    byteCount = 4;
  }

  return bytes.concat([
    bytes.createFromByteArray([byteCount]),
    bytes.createFromByteArray(Array.from({ length: byteCount }, (_, i) => (value >>> (i * 8)) & 0xff)),
  ]);
}

function encodeMessage(bytes: ReturnType<typeof createByteContext>, payload: string): ByteBufferHandle {
  const compressed = bytes.gzip(bytes.createFromString(payload));
  return bytes.concat([writeInt(bytes, bytes.getSize(compressed)), compressed]);
}

describe('apps/opscotch-diagnostics/read', () => {
  it('reads gzipped payloads from the attachment buffer and returns them as a JSON array', async () => {
    const bytes = createByteContext();
    const attachmentHandle = bytes.concat([
      encodeMessage(bytes, 'first payload'),
      encodeMessage(bytes, '{"second":true}'),
    ]);
    const context = createJavascriptContext({
      byteContext: {
        ...bytes,
        reader(buffer) {
          return bytes.reader((buffer === 'attachment' ? attachmentHandle : buffer) as ByteBufferHandle);
        },
      },
    });

    await runResource({ resource, context });

    expect(context.getBody()).toBe(JSON.stringify(['first payload', '{"second":true}']));
  });
});
