doc
  .description("Prepare and enqueue async CLI sidecar refine invoke")
  .asUserErrors()
  .inSchema({
    type: "object",
    required: ["repo", "issue", "updated_at", "title", "issue_body", "comments", "issue_context", "matched_label"],
    additionalProperties: true,
    properties: {
      repo: { type: "string", minLength: 3, pattern: "^[^/]+\\/[^/]+$", description: "Repository in owner/repo format" },
      issue: { oneOf: [{ type: "number", minimum: 1 }, { type: "string", pattern: "^[1-9][0-9]*$" }], description: "Issue number or string" },
      updated_at: { type: "string", minLength: 1, description: "Update timestamp" },
      title: { type: "string", minLength: 1, description: "Issue title" },
      issue_body: { type: ["string", "null"], description: "Issue body; GitHub returns null when empty" },
      comments: { type: "array", items: { type: "object", additionalProperties: true }, description: "Issue comments" },
      issue_context: { type: "object", description: "Issue context metadata" },
      matched_label: { type: "string", minLength: 1, description: "Matched label" },
      reason: { type: "string", description: "Reason for refinement" },
      base_branch: { type: "string", description: "Override base branch" }
    }
  })
  .dataSchema({
    type: "object",
    required: [
      "issueUpdaterDeploymentAccessId",
      "issueUpdaterAddCommentStepId",
      "issueUpdaterUpdateIssueStepId",
      "issueUpdaterDeleteCommentStepId",
      "actionInstructionsByRepoLabel",
      "refineWorkflow"
    ],
    additionalProperties: true,
    properties: {
      issueUpdaterDeploymentAccessId: { type: "string", minLength: 1, description: "Deployment access id for updates" },
      issueUpdaterAddCommentStepId: { type: "string", minLength: 1, description: "Step ID for add comment" },
      issueUpdaterUpdateIssueStepId: { type: "string", minLength: 1, description: "Step ID for update issue" },
      issueUpdaterDeleteCommentStepId: { type: "string", minLength: 1, description: "Step ID for delete comment" },
      actionInstructionsByRepoLabel: {
        type: "object",
        description: "Instructions and AI settings by repo and label",
        additionalProperties: {
          type: "object",
          additionalProperties: {
            type: "object",
            additionalProperties: false,
            required: ["instructions", "ai"],
            properties: {
              instructions: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
              successLabel: { type: "string", minLength: 1, description: "Optional label to apply after successful completion" },
              ai: {
                type: "object",
                additionalProperties: false,
                required: ["provider", "model", "reasoningEffort", "verbosity"],
                properties: {
                  provider: { type: "string", enum: ["codex", "minimax"] },
                  model: { type: "string", minLength: 1 },
                  reasoningEffort: { type: "string", enum: ["none", "minimal", "low", "medium", "high", "xhigh"] },
                  verbosity: { type: "string", enum: ["low", "medium", "high"] }
                }
              }
            }
          }
        }
      },
      refineWorkflow: { type: "string", minLength: 1, description: "Default workflow name" }
    }
  })
  .outSchema({
    type: "object",
    properties: {
      queued: { type: "boolean", description: "Whether request was queued" },
      status: { type: "string", enum: ["ok", "error"], description: "Request status" }
    }
  })
  .run(() => {

    function parseStepBodyStrict(response, sourceStepId) {
      if (response.isErrored()) {
        throw new Error(stepErrorMessage(response, sourceStepId));
      }
      var rawBody = response ? response.getBody() : "";
      if (rawBody === null || rawBody === undefined || rawBody === "") {
        return {};
      }
      if (typeof rawBody === "object") {
        throw new Error("Expected string body from " + sourceStepId + " but received object");
      }
      return JSON.parse(String(rawBody));
    }

    function stepErrorMessage(response, sourceStepId) {
      var detail = { step_id: sourceStepId };
      try {
        var bodyText = response.getBody();
        if (bodyText) {
          try { detail.body = JSON.parse(bodyText); } catch (e) { detail.body = bodyText; }
        }
      } catch (e) { /* ignore */ }
      try {
        var allErrors = response.getAllErrors();
        if (allErrors) detail.errors = allErrors;
      } catch (e) { /* ignore */ }
      try {
        var first = response.getFirstError(detail.errors ?? []);
        if (first) detail.first_error = String(first);
      } catch (e) { /* ignore */ }
      return sourceStepId + " step errored: " + JSON.stringify(detail);
    }

    // Parse body and data - schema validates these
    var payload = JSON.parse(context.getBody());
    var data = JSON.parse(context.getData());

    // Helpers using nullish coalescing
    function normStr(value) {
      return String(value ?? "");
    }

    function toPositiveInt(value) {
      var n = parseInt(value, 10);
      if (isNaN(n) || n <= 0) throw new Error("issue must be a positive integer");
      return n;
    }

    function createUuid() {
      var ts = Date.now();
      return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
        var r = (ts + Math.random() * 16) % 16 | 0;
        ts = Math.floor(ts / 16);
        if (c === "x") return r.toString(16);
        return (r & 0x3 | 0x8).toString(16);
      });
    }

    var operationalCommentMarker = "<!-- OPSCOTCH_AI_DEVELOPER_OPERATIONAL -->";

    function operationalComment(message) {
      return normStr(message).trim() + "\n\n" + operationalCommentMarker;
    }

    function isOperationalComment(comment) {
      return normStr(comment?.body).indexOf(operationalCommentMarker) >= 0;
    }

    // Resolve instructions
    function resolveInstructions(repo, label) {
      var lines = data.actionInstructionsByRepoLabel[repo][label.toLowerCase()].instructions;
      return lines.map(function(l) {
        var line = normStr(l).trim();
        if (!line) return "";
        if (line.slice(-1) !== ".") line += ".";
        return line + " ";
      }).filter(function(x) { return x; }).join("\n\n");
    }

    function resolveStageConfig(repo, label) {
      var labelKey = normStr(label).trim().toLowerCase();
      var stageConfig = data.actionInstructionsByRepoLabel[repo][labelKey];
      return {
        instructions: resolveInstructions(repo, labelKey),
        success_label: normStr(stageConfig.successLabel).trim(),
        ai: {
          provider: stageConfig.ai.provider,
          model: stageConfig.ai.model,
          reasoning_effort: stageConfig.ai.reasoningEffort,
          verbosity: stageConfig.ai.verbosity
        }
      };
    }

    function extractFieldFromText(text, fieldName) {
      var safeField = String(fieldName ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      var pattern = new RegExp("(?:^|\\s)" + safeField + "\\s*=\\s*([^\\s`]+)", "ig");
      var match;
      var found = "";
      var source = normStr(text);
      while ((match = pattern.exec(source)) !== null) {
        found = normStr(match[1]).trim();
      }
      return found;
    }

    function extractFieldFromComments(commentsList, fieldName) {
      var found = "";
      var list = Array.isArray(commentsList) ? commentsList : [];
      for (var i = 0; i < list.length; i += 1) {
        var next = extractFieldFromText(list[i]?.body, fieldName);
        if (next) found = next;
      }
      return found;
    }

    function resolveSidecarRepositories(repo, branchValues) {
      var configs = data.sidecarRepositoriesByRepo?.[repo];
      if (!Array.isArray(configs) || configs.length === 0) return [];
      return configs.map(function(item) {
        var branchFrom = normStr(item?.branchFrom).trim();
        var branch = normStr(item?.branch ?? (branchFrom ? branchValues[branchFrom] : "")).trim();
        if (!branch) {
          throw new Error(branchFrom + " is required for sidecar repository " + normStr(item?.repo));
        }
        return {
          repo: normStr(item?.repo).trim(),
          path: normStr(item?.path).trim(),
          branch: branch,
          writable: item?.writable !== false,
          primary: item?.primary === true
        };
      });
    }

    // Add comment (throws on failure)
    function addComment(repo, issueNumber, comment) {
      var result = context.sendToStep(data.issueUpdaterDeploymentAccessId, data.issueUpdaterAddCommentStepId, JSON.stringify({ repo: repo, issue: issueNumber, comment: comment }));
      var body = parseStepBodyStrict(result, data.issueUpdaterAddCommentStepId);
      if ((body.status ?? "").toLowerCase() !== "ok") {
        throw new Error("Unable to write comment: " + JSON.stringify(body));
      }
      return body;
    }

    function updateIssue(repo, issueNumber, updatePayload, sourceStepId) {
      var payload = { repo: repo, issue: issueNumber };
      Object.keys(updatePayload).forEach(function(key) {
        payload[key] = updatePayload[key];
      });
      var result = context.sendToStep(data.issueUpdaterDeploymentAccessId, sourceStepId, JSON.stringify(payload));
      var body = parseStepBodyStrict(result, sourceStepId);
      if ((body.status ?? "").toLowerCase() !== "ok") {
        throw new Error("Unable to update issue: " + JSON.stringify(body));
      }
      return body;
    }

    function labelNames(issueContext) {
      var labels = issueContext && Array.isArray(issueContext.labels) ? issueContext.labels : [];
      var out = [];
      for (var i = 0; i < labels.length; i += 1) {
        var name = normStr(labels[i]?.name ?? labels[i]).trim();
        if (name) out.push(name);
      }
      return out;
    }

    function buildCannotStartLabels(issueContext, matched) {
      var labels = labelNames(issueContext);
      var matchedLabel = normStr(matched).trim();
      var matchedLower = matchedLabel.toLowerCase();
      var seen = {};
      var out = [];
      labels.forEach(function(label) {
        var lower = label.toLowerCase();
        if (lower === "in progress" || lower === matchedLower) return;
        if (!seen[lower]) {
          seen[lower] = true;
          out.push(label);
        }
      });
      return out;
    }

    function recoverCannotStart(errorCode, errorMessage, guidance) {
      var message = normStr(errorMessage || "unknown error");
      var isPrReview = payload.pr_review_only === true;
      var updaterError = null;
      function runUpdater(fn) {
        try {
          fn();
        } catch (e) {
          if (typeof console !== "undefined" && console.log) {
            console.log("refine-recover updater failed: " + String(e?.message ?? e));
          }
          if (!updaterError) updaterError = e;
        }
      }
      runUpdater(function() {
        addComment(repo, issue, operationalComment((isPrReview ? "Adversarial PR review was not started." : "CLI sidecar refinement was not started.") + "\n\n" +
          "- status: failed\n" +
          "- error_code: " + errorCode + "\n" +
          "- error_message: " + message +
          (guidance ? "\n\n" + guidance : "")));
      });
      runUpdater(function() {
        parseStepBodyStrict(context.sendToStep("consume-ai-action-trigger", JSON.stringify({
          repo: repo,
          issue: issue,
          matched_label: matchedLabel,
          issue_context: payload.issue_context,
          updater_deployment_access_id: data.issueUpdaterDeploymentAccessId,
          updater_step_id: data.issueUpdaterUpdateIssueStepId,
          outcome_label: isPrReview ? "pr review" : matchedLabel,
          return_assignee: normStr(payload?.issue_context?.user?.login).trim()
        })), "consume-ai-action-trigger");
      });
      context.setBody(JSON.stringify({
        queued: false,
        status: "error",
        operation: "refine",
        repo: repo,
        issue: issue,
        matched_label: matchedLabel,
        error: { code: errorCode, message: message, retryable: true }
      }));
      context.sendToStepAndForget("emit-ai-developer-metric", JSON.stringify({
        operation: isPrReview ? "adversarial_review" : "refine",
        stage: "dispatch",
        outcome: "failure",
        value: 1.0,
        metadata: { error: "true", repo: repo, issue_or_pr: issue, error_code: errorCode, error_message: message, retryable: true }
      }));
      if (updaterError) throw updaterError;
    }

    // Extract values
    var issue = toPositiveInt(payload.issue);
    var repo = normStr(payload.repo).trim();
    var matchedLabel = normStr(payload.matched_label).trim();
    var stageConfig = resolveStageConfig(repo, matchedLabel);
    var instructions = stageConfig.instructions;
    var ai = stageConfig.ai;

    // Get step IDs
    var updaterDeploymentAccessId = data.issueUpdaterDeploymentAccessId;
    var updaterAddCommentStepId = data.issueUpdaterAddCommentStepId;
    var updaterUpdateIssueStepId = data.issueUpdaterUpdateIssueStepId;
    var updaterDeleteCommentStepId = data.issueUpdaterDeleteCommentStepId;

    var comments = (payload.comments ?? []).filter(function(c) {
      return !isOperationalComment(c);
    });

    // Get base branch
    var baseResp = context.sendToStep("extract-base-branch", JSON.stringify({ issue_body: payload.issue_body, comments: comments, base_branch: payload.base_branch ?? "" }));
    var baseBody = parseStepBodyStrict(baseResp, "extract-base-branch");
    var baseBranch = normStr(baseBody?.base_branch ?? payload.base_branch).trim();
    var communityBranch = normStr(payload.community_branch).trim() ||
      extractFieldFromText(payload.issue_body, "community_branch") ||
      extractFieldFromComments(comments, "community_branch");
    if (!baseBranch) {
      recoverCannotStart("missing_base_branch", "base_branch is required for refine invoke", "Add a base branch to the issue, for example:\n\n`base_branch=main`");
      return;
    }

    var isPrReview = payload.pr_review_only === true;
    var headBranch = normStr(payload.head_branch).trim();
    if (isPrReview && !headBranch) {
      recoverCannotStart("missing_pr_head_branch", "PR head branch is required for adversarial review", "Remove and re-add the `adversarial review` label after the PR branch is available.");
      return;
    }
    var repositories;
    try {
      repositories = isPrReview ? [] : resolveSidecarRepositories(repo, {
        base_branch: baseBranch,
        community_branch: communityBranch
      });
    } catch (e) {
      recoverCannotStart("missing_repository_branch", normStr(e?.message ?? e), "Add the missing branch to the issue, for example:\n\n`community_branch=main`");
      return;
    }

    // Create IDs
    var updatedAt = payload.updated_at ?? "";
    var requestId = createUuid();
    var idempotencyKey = repo + ":" + issue + ":" + updatedAt;
    var startedAt = new Date(context.getTimestamp()).toISOString();

    // Build state
    var state = {
      operation: isPrReview ? "question" : "refine",
      pr_review_only: payload.pr_review_only === true,
      pull_number: payload.pull_number,
      repo: repo,
      issue: issue,
      request_id: requestId,
      idempotency_key: idempotencyKey,
      started_at: startedAt,
      workflow: data.refineWorkflow,
      ai: ai,
      success_label: stageConfig.success_label,
      base_branch: baseBranch,
      work_branch: headBranch,
      repositories: repositories,
      matched_label: matchedLabel,
      updater_deployment_access_id: updaterDeploymentAccessId,
      updater_add_comment_step_id: updaterAddCommentStepId,
      updater_update_issue_step_id: updaterUpdateIssueStepId,
      updater_delete_comment_step_id: updaterDeleteCommentStepId,
      payload: {
        title: payload.title ?? "",
        issue_body: payload.issue_body ?? "",
        issue_context: payload.issue_context ?? {},
        updated_at: updatedAt,
        comments: comments,
        reason: payload.reason ?? "triage-labeled-and-assigned",
        instructions: instructions
      }
    };

    // Forward to invoke
    var invokeResponse = context.sendToStep("dispatch-bmad-refine-invoke", JSON.stringify(state));
    if (!invokeResponse) throw new Error("dispatch-bmad-refine-invoke returned no response");
    var invokeBody = invokeResponse.getBody();
    if (typeof invokeBody === "object") {
      throw new Error("Expected string body from dispatch-bmad-refine-invoke but received object");
    }
    var invokeResult = JSON.parse(String(invokeBody ?? "{}"));
    if (invokeResult.queued === true && invokeResult.status === "ok") {
      addComment(repo, issue, operationalComment((payload.pr_review_only ? "Adversarial PR review started by CLI sidecar reviewer" : "Refinement started by CLI sidecar reviewer") + " (" + data.refineWorkflow + " / " + ai.model + ").\n\n- status: started\n- started_at: " + startedAt + "\n- request_id: " + requestId + "\n- idempotency_key: " + idempotencyKey + "\n- workflow: " + data.refineWorkflow + "\n- repo: " + repo + "\n- issue: " + issue + "\n- provider: " + ai.provider + "\n- model: " + ai.model + "\n- reasoning_effort: " + ai.reasoning_effort + "\n- verbosity: " + ai.verbosity));
    }
    context.setBody(invokeBody);
  });
