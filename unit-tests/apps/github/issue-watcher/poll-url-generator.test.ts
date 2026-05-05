import path from 'node:path';
import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = path.resolve(import.meta.dirname, '../../../../resources/apps/github/poll-url-generator.js');

describe('poll-url-generator', () => {
  it('builds github issues query url and headers', async () => {
    const context = createJavascriptContext({
      data: {
        hostId: 'github-api',
        'githubIssueWatcherCriteria': [
          {
            label: 'triage',
            assignee: 'machinoal2-cell',
            repo: 'opscotch/hopscotch',
            deploymentId: 'openclaw-ticket-actions',
            stepId: 'dispatch-bmad-refine',
          },
        ],
      },
    });

    await runResource({ resource, context });

    expect(context.__method).toBe('GET');
    expect(context.__url?.hostRef).toBe('github-api');
    expect(context.__url?.path).toContain('/repos/opscotch/hopscotch/issues?');
    expect(context.__url?.path).toContain('assignee=machinoal2-cell');
    expect(context.__url?.path).not.toContain('labels=');
    expect(context.getHeader('accept')).toBe('application/vnd.github+json');
    expect(context.getHeader('x-github-api-version')).toBe('2022-11-28');
    expect(context.getProperty('gh_repo')).toBe('opscotch/hopscotch');
    expect(context.getProperty('gh_assignee')).toBe('machinoal2-cell');
  });
});
