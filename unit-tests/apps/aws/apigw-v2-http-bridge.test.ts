import path from 'node:path';
import {
  createJavascriptContext,
  createJavascriptStateContext, createResourceSuite,
} from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../resources/apps/aws/apigw-v2-http-bridge.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('apps/aws/apigw-v2-http-bridge', () => {
  it('normalizes the event, forwards it, and wraps the response as lambda proxy output', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        version: '2.0',
        rawPath: '/ignored',
        rawQueryString: 'a=1',
        headers: {
          'content-type': 'text/plain',
          'x-test': '1',
        },
        body: Buffer.from('hello world').toString('base64'),
        isBase64Encoded: true,
        pathParameters: {
          proxy: 'proxy/path',
        },
        requestContext: {
          http: {
            method: 'POST',
          },
        },
      }),
      data: {
        deploymentAccessId: 'dep-1',
        stepId: 'target-step',
      },
      sendToStep(call) {
        if (call.stepName === 'target-step') {
          return createJavascriptStateContext({
            body: '{"ok":true}',
            properties: {
              status_code: '201',
            },
          });
        }
      },
    });

    await suite.run("resource", { context });

    expect(context.__sendToStepCalls).toEqual([
      {
        deploymentAccessId: 'dep-1',
        stepName: 'target-step',
        body: JSON.stringify({
          path: '/proxy/path',
          method: 'POST',
          queryString: 'a=1',
          headers: {
            'content-type': 'text/plain',
            'x-test': '1',
          },
          isBase64Encoded: false,
          body: 'hello world',
        }),
        headers: {
          'content-type': 'text/plain',
          'x-test': '1',
        },
      },
    ]);
    expect(context.getProperty('useResponse')).toBe('true');
    expect(context.getBody()).toBe(JSON.stringify({
      statusCode: 201,
      headers: {
        'content-type': 'application/json',
      },
      body: '{"ok":true}',
      isBase64Encoded: false,
    }));
  });
});
