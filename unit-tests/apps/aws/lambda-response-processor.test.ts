import path from 'node:path';
import {
  createJavascriptContext,
  createJavascriptStateContext, createResourceSuite,
} from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../resources/apps/aws/lambda-response-processor.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('apps/aws/lambda-response-processor', () => {
  it('routes an API Gateway v2 event to the configured handler and forwards the lambda response', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        version: '2.0',
        requestContext: {
          http: {
            method: 'GET',
          },
        },
      }),
      headers: {
        'Lambda-Runtime-Aws-Request-Id': '["req-123"]',
      },
      data: {
        eventRouting: {
          'apigw-v2': {
            deploymentAccessId: '_test_',
            stepId: 'bridge-step',
          },
        },
      },
      sendToStep(call) {
        if (call.stepName === 'bridge-step') {
          return createJavascriptStateContext({
            body: '{"statusCode":200,"headers":{"content-type":"application/json"},"body":"ok"}',
            properties: {
              useResponse: 'true',
            },
          });
        }
      },
    });

    await suite.run("resource", { context });

    expect(context.getProperty('awsRequestId')).toBe('req-123');
    expect(context.getProperty('responseType')).toBe('response');
    expect(context.getBody()).toBe('{"statusCode":200,"headers":{"content-type":"application/json"},"body":"ok"}');
    expect(context.__sendToStepCalls).toEqual([
      {
        stepName: 'bridge-step',
        body: '{"version":"2.0","requestContext":{"http":{"method":"GET"}}}',
        headers: undefined,
      },
      {
        stepName: 'lambda-listener-response',
        body: '{"statusCode":200,"headers":{"content-type":"application/json"},"body":"ok"}',
        headers: undefined,
      },
    ]);
  });

  it('copies downstream system errors onto the current context and routes the lambda error response', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        version: '2.0',
        requestContext: {
          http: {
            method: 'GET',
          },
        },
      }),
      headers: {
        'Lambda-Runtime-Aws-Request-Id': '["req-456"]',
      },
      data: {
        eventRouting: {
          'apigw-v2': {
            deploymentAccessId: '_test_',
            stepId: 'bridge-step',
          },
        },
      },
      sendToStep(call) {
        if (call.stepName === 'bridge-step') {
          return createJavascriptStateContext({
            systemErrors: ['it failed'],
          });
        }
      },
    });

    await suite.run("resource", { context });

    expect(context.hasSystemErrors()).toBe(true);
    expect(context.getSystemErrors()).toEqual(['it failed']);
    expect(context.getProperty('responseType')).toBe('error');
    expect(context.__sendToStepCalls).toEqual([
      {
        stepName: 'bridge-step',
        body: '{"version":"2.0","requestContext":{"http":{"method":"GET"}}}',
        headers: undefined,
      },
      {
        stepName: 'lambda-listener-response',
        body: '{"errorMessage":"it failed","errorType":"Exception"}',
        headers: undefined,
      },
    ]);
  });
});
