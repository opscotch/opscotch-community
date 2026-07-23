import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../resources/apps/ospcotch-key-store-dynamodb/storage-provider.js');
const suite = createResourceSuite({ resources: [{ id: 'resource', resource }] });

describe('key-store-dynamodb/storage-provider', () => {
  it('routes to the DynamoDB provider', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({ operation: 'getPair', pairId: 'pair', publicRecordId: 'public', secretRecordId: 'secret', includeSecret: false }),
      sendToStep(call) {
        expect(call.stepName).toBe('storage-provider-dynamodb');
        return { body: JSON.stringify({ status: 'not-found' }) };
      },
    });

    await suite.run('resource', { context });

    expect(JSON.parse(context.getBody() || '{}')).toEqual({ status: 'not-found' });
  });
});
