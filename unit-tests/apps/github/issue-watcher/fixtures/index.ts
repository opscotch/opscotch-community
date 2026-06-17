import path from 'node:path';

import type { ContextOptions, JavascriptContextRuntime } from '@opscotch/resource-testkit';
import { expect } from 'vitest';

process.env.OPSCOTCH_RESOURCE_TESTKIT_COVERAGE_FILE ??= path.resolve(
  import.meta.dirname,
  'opscotch-resource-testkit-coverage.json',
);

type BodyValue = string | null | Record<string, unknown> | Array<unknown>;

export type BuildContextFixtureOptions = Omit<ContextOptions, 'body'> & {
  body?: BodyValue;
};

export type ExpectedSendToStepCall = {
  deploymentAccessId?: string;
  stepName: string;
  body?: unknown;
  headers?: Record<string, string>;
};

export function buildContextFixture(options: BuildContextFixtureOptions = {}): ContextOptions {
  return {
    body: serializeBody(options.body),
    data: options.data ?? {},
    headers: options.headers ?? {},
    properties: options.properties ?? {},
    stepProperties: options.stepProperties ?? {},
    persistedItems: options.persistedItems ?? {},
    timestamp: options.timestamp,
    byteContext: options.byteContext,
    stubPolicy: options.stubPolicy,
    sendToStep: options.sendToStep ?? (() => ({ body: '{}' })),
    sendToStepAndForget: options.sendToStepAndForget,
    crypto: options.crypto,
    files: options.files,
    queue: options.queue,
    restrictedData: options.restrictedData,
    authenticationProperties: options.authenticationProperties,
  };
}

export function getDataJson<T>(
  context: Pick<JavascriptContextRuntime, 'getData'>,
  key?: string,
  fallback?: T,
): T | undefined {
  const raw = context.getData(key);
  if (raw == null || raw === '') {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function expectSendToStep(
  context: Pick<JavascriptContextRuntime, '__sendToStepCalls'>,
  expectedCalls: ExpectedSendToStepCall[],
) {
  expect(context.__sendToStepCalls).toHaveLength(expectedCalls.length);

  expectedCalls.forEach((expectedCall, index) => {
    const actualCall = context.__sendToStepCalls[index];
    expect(actualCall.stepName).toBe(expectedCall.stepName);
    expect(actualCall.deploymentAccessId).toBe(expectedCall.deploymentAccessId);
    expect(actualCall.headers ?? undefined).toEqual(expectedCall.headers ?? undefined);

    if (expectedCall.body !== undefined) {
      expect(parseBody(actualCall.body)).toMatchObject(expectedCall.body as Record<string, unknown>);
    }
  });
}

function serializeBody(body: BodyValue | undefined) {
  if (body === undefined) {
    return '{}';
  }
  if (body === null || typeof body === 'string') {
    return body;
  }
  return JSON.stringify(body);
}

function parseBody(body: string | null) {
  if (body == null || body === '') {
    return body;
  }

  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}
