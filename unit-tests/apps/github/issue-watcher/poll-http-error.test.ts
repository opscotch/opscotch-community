import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../../resources/apps/github/http-error.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('poll-http-error', () => {
  it('records system error and wraps github failure response', async () => {
    const context = createJavascriptContext({
      body: 'forbidden',
      data: { httpErrorKind: 'github-poll' },
      properties: {
        status_code: '403',
        gh_poll_group: JSON.stringify({
          repo: 'opscotch/hopscotch',
          assignee: 'machinoal2-cell',
          watchEntity: 'pr',
          criteria: [{ label: 'triage', deploymentId: 'ticket-actions', stepId: 'dispatch-triage' }],
        }),
      },
    });

    await suite.run("resource", { context });

    expect(context.hasSystemErrors()).toBe(true);
    expect(context.getSystemErrors().join(' ')).toContain('403');
    expect(JSON.parse(context.getBody() || '{}')).toEqual({
      status: 'error',
      status_code: '403',
      response: 'forbidden',
      repo: 'opscotch/hopscotch',
      assignee: 'machinoal2-cell',
      watchEntity: 'pr',
      criteria: [{ label: 'triage', deploymentId: 'ticket-actions', stepId: 'dispatch-triage' }],
      items: [],
      errors: [{
        systemError: 'GitHub polling request failed with status 403: forbidden',
        status_code: '403',
        response: 'forbidden',
        httpErrorKind: 'github-poll',
      }],
    });
  });
});
