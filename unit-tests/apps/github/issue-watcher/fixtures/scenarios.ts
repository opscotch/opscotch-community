import type { ContextOptions } from '@opscotch/resource-testkit';

import { buildContextFixture } from './index.js';

type IssueWatcherCriterion = {
  label: string;
  assignee: string;
  repo: string;
  deploymentId: string;
  stepId: string;
};

type IssueLike = {
  number: number;
  title: string;
  html_url: string;
  updated_at: string;
  body?: string;
  labels: Array<{ name: string }>;
  assignees: Array<{ login: string }>;
  pull_request?: {
    html_url: string;
  };
};

type EventPayload = Record<string, unknown>;

function issueCriterion(overrides: Partial<IssueWatcherCriterion> = {}): IssueWatcherCriterion {
  return {
    label: 'triage',
    assignee: 'machinoal2-cell',
    repo: 'opscotch/hopscotch',
    deploymentId: 'openclaw-ticket-actions',
    stepId: 'dispatch-bmad-refine-triage',
    ...overrides,
  };
}

function issueFixture(issue: IssueLike, criterion: IssueWatcherCriterion, overrides: Partial<ContextOptions> = {}) {
  return buildContextFixture({
    body: [issue],
    data: {
      githubIssueWatcherCriteria: [criterion],
      issueWatcherDecisionLoggingEnabled: true,
    },
    ...overrides,
  });
}

function routeFixture(eventPayload: EventPayload, overrides: Partial<ContextOptions> = {}) {
  return buildContextFixture({
    body: eventPayload,
    data: {
      issueWatcherDecisionLoggingEnabled: true,
    },
    ...overrides,
  });
}

const triageAssignedIssue = {
  number: 317,
  title: 'Triage this ticket',
  html_url: 'https://github.com/opscotch/hopscotch/issues/317',
  updated_at: '2026-04-24T01:10:00Z',
  body: 'Please refine this ticket with full context.',
  labels: [{ name: 'triage' }],
  assignees: [{ login: 'machinoal2-cell' }],
} satisfies IssueLike;

const triageAssignedCriterion = issueCriterion({
  label: 'triage',
  deploymentId: 'openclaw-ticket-actions',
  stepId: 'dispatch-bmad-refine-triage',
});

export const triageAssigned = {
  issue: triageAssignedIssue,
  criterion: triageAssignedCriterion,
  buildPollContext(overrides: Partial<ContextOptions> = {}) {
    return issueFixture(triageAssignedIssue, triageAssignedCriterion, overrides);
  },
  buildRouteEvent(overrides: EventPayload = {}) {
    return {
      repo: triageAssignedCriterion.repo,
      issue_number: triageAssignedIssue.number,
      entity_type: 'issue',
      labels: ['triage'],
      matched_label: triageAssignedCriterion.label,
      action_deployment_id: triageAssignedCriterion.deploymentId,
      action_step_id: triageAssignedCriterion.stepId,
      updated_at: triageAssignedIssue.updated_at,
      issue_url: triageAssignedIssue.html_url,
      title: triageAssignedIssue.title,
      issue_body: triageAssignedIssue.body,
      issue_context: {
        number: triageAssignedIssue.number,
        title: triageAssignedIssue.title,
        html_url: triageAssignedIssue.html_url,
        updated_at: triageAssignedIssue.updated_at,
        body: triageAssignedIssue.body,
        labels: triageAssignedIssue.labels,
        assignees: triageAssignedIssue.assignees,
      },
      ...overrides,
    };
  },
  buildRouteContext(overrides: Partial<ContextOptions> = {}) {
    return routeFixture(this.buildRouteEvent(), overrides);
  },
};

const devReviewAssignedIssue = {
  number: 318,
  title: 'Developer review requested',
  html_url: 'https://github.com/opscotch/hopscotch/issues/318',
  updated_at: '2026-04-24T01:11:00Z',
  body: 'Please prepare this for implementation review.',
  labels: [{ name: 'dev-review' }],
  assignees: [{ login: 'machinoal2-cell' }],
} satisfies IssueLike;

const devReviewAssignedCriterion = issueCriterion({
  label: 'dev-review',
  deploymentId: 'openclaw-ticket-actions',
  stepId: 'dispatch-non-triage',
});

export const devReviewAssigned = {
  issue: devReviewAssignedIssue,
  criterion: devReviewAssignedCriterion,
  buildPollContext(overrides: Partial<ContextOptions> = {}) {
    return issueFixture(devReviewAssignedIssue, devReviewAssignedCriterion, overrides);
  },
  buildRouteEvent(overrides: EventPayload = {}) {
    return {
      repo: devReviewAssignedCriterion.repo,
      issue_number: devReviewAssignedIssue.number,
      entity_type: 'issue',
      labels: ['dev-review'],
      matched_label: devReviewAssignedCriterion.label,
      action_deployment_id: devReviewAssignedCriterion.deploymentId,
      action_step_id: devReviewAssignedCriterion.stepId,
      updated_at: devReviewAssignedIssue.updated_at,
      issue_url: devReviewAssignedIssue.html_url,
      title: devReviewAssignedIssue.title,
      issue_body: devReviewAssignedIssue.body,
      issue_context: {
        number: devReviewAssignedIssue.number,
        title: devReviewAssignedIssue.title,
        html_url: devReviewAssignedIssue.html_url,
        updated_at: devReviewAssignedIssue.updated_at,
        body: devReviewAssignedIssue.body,
        labels: devReviewAssignedIssue.labels,
        assignees: devReviewAssignedIssue.assignees,
      },
      ...overrides,
    };
  },
  buildRouteContext(overrides: Partial<ContextOptions> = {}) {
    return routeFixture(this.buildRouteEvent(), overrides);
  },
};

const prReadyForDevIssue = {
  number: 451,
  title: 'Apply review feedback',
  html_url: 'https://github.com/opscotch/hopscotch/pull/451',
  updated_at: '2026-05-11T02:37:20Z',
  body: 'PR body',
  labels: [{ name: 'ready for dev' }],
  assignees: [{ login: 'machinoal2-cell' }],
  pull_request: {
    html_url: 'https://github.com/opscotch/hopscotch/pull/451',
  },
} satisfies IssueLike;

const prReadyForDevCriterion = issueCriterion({
  label: 'ready for dev',
  deploymentId: 'openclaw-pr-actions',
  stepId: 'dispatch-bmad-pr-develop',
});

export const prReadyForDev = {
  issue: prReadyForDevIssue,
  criterion: prReadyForDevCriterion,
  buildPollContext(overrides: Partial<ContextOptions> = {}) {
    return buildContextFixture({
      body: [prReadyForDevIssue],
      data: {
        watchEntity: 'pr',
        githubPrWatcherCriteria: [prReadyForDevCriterion],
        issueWatcherDecisionLoggingEnabled: true,
      },
      ...overrides,
    });
  },
  buildRouteEvent(overrides: EventPayload = {}) {
    return {
      repo: prReadyForDevCriterion.repo,
      issue_number: prReadyForDevIssue.number,
      pull_number: prReadyForDevIssue.number,
      pull_url: prReadyForDevIssue.html_url,
      pull_context: { number: prReadyForDevIssue.number, head: { ref: 'feature/pr-451' } },
      entity_type: 'pr',
      labels: ['ready for dev'],
      matched_label: prReadyForDevCriterion.label,
      action_deployment_id: prReadyForDevCriterion.deploymentId,
      action_step_id: prReadyForDevCriterion.stepId,
      updated_at: prReadyForDevIssue.updated_at,
      title: prReadyForDevIssue.title,
      issue_body: prReadyForDevIssue.body,
      issue_context: { number: prReadyForDevIssue.number },
      ...overrides,
    };
  },
  buildRouteContext(overrides: Partial<ContextOptions> = {}) {
    return routeFixture(this.buildRouteEvent(), overrides);
  },
};
