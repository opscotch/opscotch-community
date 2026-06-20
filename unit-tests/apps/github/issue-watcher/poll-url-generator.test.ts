import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../../resources/apps/github/poll-url-generator.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('poll-url-generator', () => {
  it('builds github issues query url and headers from a repo group', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        repo: 'opscotch/hopscotch',
        assignee: 'machinoal2-cell',
        watchEntity: 'issue',
        criteria: [
          {
            label: 'triage',
            deploymentId: 'openclaw-ticket-actions',
            stepId: 'dispatch-bmad-refine',
          },
        ],
      }),
      data: {
        hostId: 'github-api',
      },
    });

    await suite.run("resource", { context });

    expect(context.__method).toBe('GET');
    expect(context.__url?.hostRef).toBe('github-api');
    expect(context.__url?.path).toContain('/repos/opscotch/hopscotch/issues?');
    expect(context.__url?.path).toContain('assignee=machinoal2-cell');
    expect(context.__url?.path).not.toContain('labels=');
    expect(context.getHeader('accept')).toBe('application/vnd.github+json');
    expect(context.getHeader('x-github-api-version')).toBe('2022-11-28');
    expect(JSON.parse(String(context.getProperty('gh_poll_group')))).toMatchObject({
      repo: 'opscotch/hopscotch',
      assignee: 'machinoal2-cell',
      watchEntity: 'issue',
    });
  });

  it('builds github poll URL for pr watcher repo group', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        repo: 'opscotch/hopscotch',
        assignee: 'machinoal2-cell',
        watchEntity: 'pr',
        criteria: [
          {
            label: 'ready for dev',
            deploymentId: 'openclaw-pr-actions',
            stepId: 'dispatch-bmad-pr-develop',
          },
        ],
      }),
      data: {
        hostId: 'github-api',
      },
    });

    await suite.run("resource", { context });

    expect(context.__method).toBe('GET');
    expect(context.__url?.hostRef).toBe('github-api');
    expect(context.__url?.path).toContain('/repos/opscotch/hopscotch/issues?');
    expect(context.__url?.path).toContain('assignee=machinoal2-cell');
    expect(JSON.parse(String(context.getProperty('gh_poll_group')))).toMatchObject({
      watchEntity: 'pr',
      repo: 'opscotch/hopscotch',
      assignee: 'machinoal2-cell',
    });
  });

  it('rejects unsupported watchEntity through schema validation', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        repo: 'opscotch/hopscotch',
        assignee: 'machinoal2-cell',
        watchEntity: 'ticket',
        criteria: [
          {
            label: 'triage',
            deploymentId: 'openclaw-ticket-actions',
            stepId: 'dispatch-bmad-refine',
          },
        ],
      }),
      data: {
        hostId: 'github-api',
      },
    });

    await expect(suite.run("resource", { context })).rejects.toThrow();
  });
});
