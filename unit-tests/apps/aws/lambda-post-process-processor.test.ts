import path from 'node:path';
import {
  createJavascriptContext,
  createJavascriptStateContext,
  createResourceSuite,
} from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../resources/apps/aws/lambda-post-process-processor.js');

const suite = createResourceSuite({
  resources: [{ id: 'resource', resource }],
});

describe('apps/aws/lambda-post-process-processor', () => {
  it('forwards to lambda-listener-response when post-process is unconfigured', async () => {
    const context = createJavascriptContext({
      body: '{"statusCode":200}',
      properties: {
        awsRequestId: 'req-1',
        responseType: 'response',
      },
    });

    await suite.run('resource', { context });

    expect(context.__sendToStepCalls).toEqual([
      {
        stepName: 'lambda-listener-response',
        body: '{"statusCode":200}',
        headers: undefined,
      },
    ]);
    expect(context.hasSystemErrors()).toBe(false);
  });

  it('synchronously invokes a same-deployment post-process step before responding', async () => {
    const context = createJavascriptContext({
      body: '{"statusCode":200,"body":"ok"}',
      data: {
        'post-process': {
          stepId: 'flush-metrics',
        },
      },
      sendToStep(call) {
        if (call.stepName === 'flush-metrics') {
          return createJavascriptStateContext({
            body: 'flushed',
          });
        }
      },
    });

    await suite.run('resource', { context });

    expect(context.__sendToStepCalls).toEqual([
      {
        stepName: 'flush-metrics',
        body: '{"statusCode":200,"body":"ok"}',
        headers: undefined,
      },
      {
        stepName: 'lambda-listener-response',
        body: '{"statusCode":200,"body":"ok"}',
        headers: undefined,
      },
    ]);
    expect(context.hasSystemErrors()).toBe(false);
  });

  it('synchronously invokes a cross-deployment post-process step before responding', async () => {
    const context = createJavascriptContext({
      body: '{"ok":true}',
      data: {
        'post-process': {
          stepId: 'flush-metrics',
          deploymentId: 'metrics-deployment',
        },
      },
      sendToStep(call) {
        if (call.deploymentAccessId === 'metrics-deployment' && call.stepName === 'flush-metrics') {
          return createJavascriptStateContext({
            body: 'flushed',
          });
        }
      },
    });

    await suite.run('resource', { context });

    expect(context.__sendToStepCalls).toEqual([
      {
        deploymentAccessId: 'metrics-deployment',
        stepName: 'flush-metrics',
        body: '{"ok":true}',
        headers: undefined,
      },
      {
        stepName: 'lambda-listener-response',
        body: '{"ok":true}',
        headers: undefined,
      },
    ]);
    expect(context.hasSystemErrors()).toBe(false);
  });

  it('logs post-process failures and still continues to lambda-listener-response', async () => {
    const context = createJavascriptContext({
      body: '{"statusCode":500}',
      data: {
        'post-process': {
          stepId: 'flush-metrics',
          deploymentId: 'metrics-deployment',
        },
      },
      sendToStep(call) {
        if (call.deploymentAccessId === 'metrics-deployment' && call.stepName === 'flush-metrics') {
          return createJavascriptStateContext({
            systemErrors: ['flush failed'],
          });
        }
      },
    });

    await suite.run('resource', { context });

    expect(context.hasSystemErrors()).toBe(true);
    expect(context.getSystemErrors()).toEqual(['flush failed']);
    expect(context.__sendToStepCalls).toEqual([
      {
        deploymentAccessId: 'metrics-deployment',
        stepName: 'flush-metrics',
        body: '{"statusCode":500}',
        headers: undefined,
      },
      {
        stepName: 'lambda-listener-response',
        body: '{"statusCode":500}',
        headers: undefined,
      },
    ]);
  });
});
