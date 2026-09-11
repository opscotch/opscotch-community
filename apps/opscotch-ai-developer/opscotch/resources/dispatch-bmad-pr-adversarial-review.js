doc
  .description("Dispatch a review-only adversarial PR review to the CLI sidecar reviewer")
  .asUserErrors()
  .inSchema({
    type: "object",
    required: ["repo", "pull_number", "matched_label"],
    additionalProperties: true,
    properties: {
      repo: { type: "string" },
      pull_number: { type: "number", minimum: 1 },
      matched_label: { type: "string", minLength: 1 },
      updated_at: { type: "string" },
      title: { type: "string" },
      pr_body: { type: ["string", "null"], description: "GitHub returns null when the PR description is empty" },
      pull_context: { type: "object" },
      issue_context: { type: "object" },
      comments: { type: "array" }
    }
  })
  .outSchema({
    type: "object",
    properties: { status: { type: "string" }, queued: { type: "boolean" } }
  })
  .run(() => {
    var payload = JSON.parse(context.getBody());
    var pull = payload.pull_context ?? {};
    var baseBranch = String(payload.base_branch ?? pull.base?.ref ?? "").trim();
    var headBranch = String(payload.head_branch ?? pull.head?.ref ?? "").trim();
    if (!baseBranch || !headBranch) {
      var detailsResponse = context.sendToStep("github-pr-get-details", JSON.stringify({
        repo: payload.repo,
        pull_number: payload.pull_number
      }));
      var details = JSON.parse(detailsResponse.getBody() || "{}");
      baseBranch = String(details.base_branch ?? details.raw?.base?.ref ?? "").trim();
      headBranch = String(details.head_branch ?? details.raw?.head?.ref ?? "").trim();
      if (details.title) pull.title = details.title;
      if (details.body) pull.body = details.body;
      if (details.raw) pull = details.raw;
    }
    var body = String(payload.pr_body ?? pull.body ?? "PR review requested");
    var issueContext = payload.issue_context ?? pull;
    if (!Array.isArray(issueContext.labels)) issueContext.labels = [{ name: payload.matched_label }];
    if (!issueContext.user || typeof issueContext.user !== "object") issueContext.user = { login: "" };
    var forwarded = {
      repo: payload.repo,
      issue: payload.pull_number,
      pull_number: payload.pull_number,
      updated_at: payload.updated_at ?? new Date(context.getTimestamp()).toISOString(),
      title: payload.title ?? pull.title ?? ("PR #" + payload.pull_number),
      issue_body: body,
      comments: Array.isArray(payload.comments) ? payload.comments : [],
      issue_context: issueContext,
      matched_label: payload.matched_label,
      base_branch: baseBranch,
      head_branch: headBranch,
      pr_review_only: true,
      reason: "adversarial-pr-review"
    };
    var response = context.sendToStep("cli-sidecar-ticket-actions-callers", "dispatch-bmad-refine-dev-review", JSON.stringify(forwarded));
    context.setBody(response.getBody());
  });
