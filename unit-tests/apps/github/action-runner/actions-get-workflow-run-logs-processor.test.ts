import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../../resources/apps/github/actions/actions-get-workflow-run-logs-processor.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('github/action-runner actions-get-workflow-run-logs-processor', () => {
  it('extracts redirect location from response headers', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({}),
      headers: {
        Location: JSON.stringify(['https://example.com/logs.zip?sig=abc']),
      },
    });

    await suite.run("resource", { context });
    const out = JSON.parse(context.getBody() || '{}');

    expect(out).toMatchObject({
      status: 'ok',
      operation: 'get-workflow-job-logs',
      logs_redirect_url: 'https://example.com/logs.zip?sig=abc',
      redirect_location: 'https://example.com/logs.zip?sig=abc',
      has_redirect: true,
      redirect_handled: true,
    });
  });

  it('returns empty redirect fields when Location header is absent', async () => {
    const context = createJavascriptContext({ body: JSON.stringify({}) });
    await suite.run("resource", { context });
    const out = JSON.parse(context.getBody() || '{}');

    expect(out).toMatchObject({
      status: 'ok',
      operation: 'get-workflow-job-logs',
      logs_redirect_url: '',
      has_redirect: false,
      redirect_handled: false,
    });
  });

  it('returns empty redirect when Location header is malformed JSON', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({}),
      headers: { Location: 'not-json' },
    });

    await suite.run("resource", { context });
    const out = JSON.parse(context.getBody() || '{}');
    expect(out).toMatchObject({
      status: 'ok',
      logs_redirect_url: '',
      has_redirect: false,
      redirect_handled: false,
    });
  });
});
