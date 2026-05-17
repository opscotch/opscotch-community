import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../resources/apps/aws/sqs-urlgenerator.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('apps/aws/sqs-urlgenerator', () => {
  it('builds the SQS URL from the account id and queue name', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        aws_sqs_queue: 'my-queue',
      }),
      data: {
        awsAccount: '123456789012',
      },
    });

    await suite.run("resource", { context });

    expect(context.__url).toEqual({
      hostRef: 'sqs',
      path: '/123456789012/my-queue',
    });
    expect(context.getProperty('uri')).toBe('/123456789012/my-queue');
  });
});
