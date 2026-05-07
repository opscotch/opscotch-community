import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const resource = '/home/jeremy/dev/opscotch/dev_workspace/al.machino/implementation-artifacts/opscotch/github-ticket-poller/resources/resolve-builder-run-id.js';

describe('github-ticket-poller/resolve-builder-run-id', () => {
  it('assumes first run is newest and uses it as run_id', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({ repo: 'opscotch/hopscotch', pull_number: 451 }),
      sendToStep: () => ({
        body: JSON.stringify({
          runs: [
            { id: 999, html_url: 'https://github.com/opscotch/builder/actions/runs/999', status: 'queued', conclusion: null },
            { id: 998, html_url: 'https://github.com/opscotch/builder/actions/runs/998', status: 'completed', conclusion: 'success' },
          ],
        }),
      }),
    });

    await runResource({ resource, context });

    const out = JSON.parse(context.getBody() || '{}');
    expect(out.run.run_id).toBe(999);
    expect(out.run.run_url).toContain('/999');
  });
});
