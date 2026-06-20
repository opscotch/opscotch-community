import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../resources/apps/key-gen/generate-key-pair.js');

const suite = createResourceSuite({
  resources: [{ id: 'resource', resource }],
});

describe('apps/key-gen/generate-key-pair', () => {
  it('declares enum schemas for purpose and encoding', async () => {
    const source = await fs.readFile(resource, 'utf8');
    const doc = {
      inSchemaValue: undefined as unknown,
      outSchemaValue: undefined as unknown,
      descriptionValue: undefined as unknown,
      inSchema(schema: unknown) {
        this.inSchemaValue = schema;
        return this;
      },
      outSchema(schema: unknown) {
        this.outSchemaValue = schema;
        return this;
      },
      description(description: unknown) {
        this.descriptionValue = description;
        return this;
      },
      run() {
        return this;
      },
    };

    vm.runInNewContext(source, {
      doc,
      context: {},
      console,
      JSON,
    }, {
      filename: resource,
    });

    expect(doc.inSchemaValue).toEqual({
      type: 'object',
      required: ['purpose'],
      properties: {
        purpose: {
          type: 'string',
          enum: ['sign', 'box', 'secretbox'],
        },
      },
    });
    expect(doc.outSchemaValue).toEqual({
      type: 'object',
      required: ['ok'],
      properties: {
        ok: { type: 'boolean' },
        purpose: {
          type: 'string',
          enum: ['sign', 'box', 'secretbox'],
        },
        encoding: {
          type: 'string',
          enum: ['hex'],
        },
        keyPair: {
          type: 'object',
          properties: {
            publicKeyHex: { type: ['string', 'null'] },
            secretKeyHex: { type: 'string' },
          },
        },
      },
    });
  });

  it('returns a sign key pair as hex', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({ purpose: 'sign' }),
      crypto: {
        generateKeyPair: (purpose: string) => {
          expect(purpose).toBe('sign');
          return [
            context.bytes().createFromByteArray([0xaa, 0xbb]),
            context.bytes().createFromByteArray([0xcc, 0xdd]),
          ];
        },
      },
    });

    await suite.run('resource', { context });

    expect(JSON.parse(context.getBody() || '{}')).toEqual({
      ok: true,
      purpose: 'sign',
      encoding: 'hex',
      keyPair: {
        publicKeyHex: 'aabb',
        secretKeyHex: 'ccdd',
      },
    });
    expect(context.getProperty('status_code')).toBe('200');
    expect(context.getHeader('content-type')).toBe('application/json');
  });

  it('returns a stable secretbox shape with null public key', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({ purpose: 'secretbox' }),
      crypto: {
        generateKeyPair: () => [
          null,
          context.bytes().createFromByteArray([0x10, 0x20]),
        ],
      },
    });

    await suite.run('resource', { context });

    expect(JSON.parse(context.getBody() || '{}')).toEqual({
      ok: true,
      purpose: 'secretbox',
      encoding: 'hex',
      keyPair: {
        publicKeyHex: null,
        secretKeyHex: '1020',
      },
    });
  });
});
