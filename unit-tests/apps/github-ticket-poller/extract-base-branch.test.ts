import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';
import { describe, expect, it } from 'vitest';

const appsRoot = process.env.OPSCOTCH_APPS_REPO_ROOT
  ?? path.resolve(import.meta.dirname, '../../../../opscotch-apps-source');
const resource = path.join(
  appsRoot,
  'opscotch-ai-developer/opscotch/resources/extract-base-branch.js',
);

const suite = createResourceSuite({
  resources: [{ id: 'resource', resource }],
});

async function normalize(input: Record<string, unknown>) {
  const context = createJavascriptContext({ body: JSON.stringify(input) });
  await suite.run('resource', { context });
  return JSON.parse(context.getBody() || '{}');
}

describe('github-ticket-poller/extract-base-branch', () => {
  it('extracts both branch settings from case-insensitive labels while preserving branch text', async () => {
    await expect(normalize({
      issue_context: {
        labels: [
          { name: 'BASE_BRANCH_release/3.1.8' },
          { name: 'community_branch_feature.3-1_8' },
          { name: 'unrelated_label' },
        ],
      },
    })).resolves.toMatchObject({
      base_branch: 'release/3.1.8',
      source: 'labels',
      community_branch: 'feature.3-1_8',
      community_branch_source: 'labels',
    });
  });

  it('preserves existing text extraction and gives explicit values precedence over labels', async () => {
    await expect(normalize({
      issue_body: 'base_branch=release/3.1 community_branch=community-from-body',
      base_branch: 'explicit-base',
      community_branch: 'explicit-community',
      issue_context: {
        labels: [
          { name: 'base_branch_label-base' },
          { name: 'community_branch_label-community' },
        ],
      },
    })).resolves.toMatchObject({
      base_branch: 'release/3.1',
      source: 'issue_body',
      community_branch: 'explicit-community',
      community_branch_source: 'payload',
    });
  });

  it('rejects empty and duplicate branch labels', async () => {
    await expect(normalize({
      issue_context: { labels: [{ name: 'base_branch_ ' }] },
    })).rejects.toThrow('base_branch label must include a branch name');

    await expect(normalize({
      issue_context: {
        labels: [{ name: 'community_branch_main' }, { name: 'COMMUNITY_BRANCH_release/3.1' }],
      },
    })).rejects.toThrow('duplicate community_branch labels are not allowed');
  });
});
