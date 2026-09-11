doc
  .description("Invoke reviewer asynchronously and persist pending refine state")
  .asUserErrors()
  .inSchema({
    type: "object",
    required: [
      "repo", "issue", "request_id", "idempotency_key", "started_at", "workflow", "ai", "base_branch",
      "matched_label", "updater_deployment_access_id", "updater_add_comment_step_id", "updater_update_issue_step_id",
      "updater_delete_comment_step_id", "payload"
    ],
    additionalProperties: true,
    properties: {
      repo: { type: "string", minLength: 3, pattern: "^[^/]+\\/[^/]+$", description: "Repository in owner/repo format" },
      issue: { type: "number", minimum: 1, description: "Issue number" },
      request_id: { type: "string", minLength: 1, description: "Request identifier" },
      idempotency_key: { type: "string", minLength: 1, description: "Idempotency key" },
      started_at: { type: "string", minLength: 1, description: "Start timestamp" },
      workflow: { type: "string", minLength: 1, description: "Workflow name" },
      ai: {
        type: "object",
        additionalProperties: false,
        required: ["provider", "model", "reasoning_effort", "verbosity"],
        properties: {
          provider: { type: "string", enum: ["codex", "minimax"], description: "AI provider" },
          model: { type: "string", minLength: 1, description: "Model name" },
          reasoning_effort: { type: "string", enum: ["none", "minimal", "low", "medium", "high", "xhigh"], description: "Reasoning effort" },
          verbosity: { type: "string", enum: ["low", "medium", "high"], description: "Verbosity" }
        }
      },
      base_branch: { type: "string", minLength: 1, description: "Base branch name" },
      matched_label: { type: "string", minLength: 1, description: "Matched label" },
      payload: { type: "object", additionalProperties: true, description: "Payload containing issue data" }
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

    function emitMetric(state, outcome, extra) {
      var operation = state.pr_review_only === true ? "adversarial_review" : "refine";
      var metadata = { repo: state.repo, issue_or_pr: state.issue, request_id: state.request_id, run_id: state.run_id, idempotency_key: state.idempotency_key };
      Object.keys(extra || {}).forEach(function(key) { metadata[key] = extra[key]; });
      context.sendToStepAndForget("emit-ai-developer-metric", JSON.stringify({
        operation: operation,
        stage: "invoke",
        outcome: outcome,
        value: 1.0,
        metadata: outcome === "failure" ? Object.assign({}, metadata, { error: "true" }) : metadata
      }));
    }

    // Parse body - schema validates input
    var state = JSON.parse(context.getBody());

    // Helpers using nullish coalescing
    function normStr(value) {
      return String(value ?? "");
    }

    function operationalComment(message) {
      return String(message ?? "").trim() + "\n\n<!-- OPSCOTCH_AI_DEVELOPER_OPERATIONAL -->";
    }

    // Normalize response
    function normalizeResponse(body) {
      var source = body ?? {};
      var nested = source.response;
      if (typeof nested === "string") {
        try { nested = JSON.parse(nested); } catch (e) { nested = null; }
      }
    if (nested && typeof nested === "object") {
      if (!source.error && nested.error) source.error = nested.error;
      if (!source.request_id) source.request_id = nested.request_id;
      if (!source.operation) source.operation = nested.operation;
      source.response = nested;
    }
      if ((source.status_code ?? source.statusCode ?? "") === "429" && !source.error) {
        source.error = { code: "rate_limited", message: "CLI sidecar invoke already in progress", retryable: true };
      }
      return source;
    }

    // Check rate limited
    function isLimited(body) {
      var code = (body?.error?.code ?? "").toLowerCase();
      if (code === "rate_limited") return true;
      var message = (body?.error?.message ?? "").toLowerCase();
      return message.includes("429") || message.includes("rate limit") || message.includes("already in progress");
    }

    // Call updater step
    function callUpdater(stepId, payload, opName) {
      var result = context.sendToStep(state.updater_deployment_access_id, stepId, JSON.stringify(payload));
      var body = parseStepBodyStrict(result, stepId);
      if ((body.status ?? "").toLowerCase() !== "ok") {
        throw new Error("updater " + opName + " failed: " + JSON.stringify(body));
      }
      return body;
    }

    function logDiagnostic(message, details) {
      var line = message + (details ? ": " + JSON.stringify(details) : "");
      context.diagnosticLog(line);
    }

    // Get label names
    function getLabels(issueContext) {
      return (issueContext?.labels ?? []).map(function(l) {
        return normStr(l?.name ?? l);
      }).filter(function(n) { return n; });
    }

    // Build in-progress labels
    function buildInProgress(issueContext, matched) {
      var existing = getLabels(issueContext);
      var matchedLower = (matched ?? "").toLowerCase();
      var out = existing.filter(function(l) {
        return l.toLowerCase() !== matchedLower && l.toLowerCase() !== "in progress";
      });
      out.push("in progress");
      return out;
    }

    // Build recovery labels
    function buildRecovery(issueContext, matched) {
      var existing = getLabels(issueContext);
      var seen = {};
      var matchedLower = (matched ?? "").toLowerCase();
      var out = [];
      existing.forEach(function(label) {
        var lower = label.toLowerCase();
        if (lower === "in progress" || lower === matchedLower) return;
        if (!seen[lower]) {
          seen[lower] = true;
          out.push(label);
        }
      });
      return out;
    }

    function buildPrReviewLabels(issueContext, matched) {
      var existing = getLabels(issueContext);
      var matchedLower = String(matched ?? "").trim().toLowerCase();
      return existing.filter(function(label) {
        var lower = label.toLowerCase();
        return lower !== matchedLower && lower !== "in progress" && lower !== "pr review";
      }).concat(["pr review"]);
    }

    // Handle immediate failure
    function handleFailure(responseBody) {
      var errorCode = responseBody?.error?.code ?? "cli_sidecar_invoke_failed";
      var errorMessage = responseBody?.error?.message ?? "CLI sidecar refinement failed";
      callUpdater(state.updater_add_comment_step_id, {
        repo: state.repo,
        issue: state.issue,
        comment: operationalComment((state.pr_review_only === true ? "Adversarial PR review failed." : "CLI sidecar refinement failed.") + "\n\n- status: failed\n- request_id: " + (responseBody?.request_id ?? state.request_id) + "\n- error_code: " + errorCode + "\n- error_message: " + errorMessage)
      }, "add-comment");

      parseStepBodyStrict(context.sendToStep("consume-ai-action-trigger", JSON.stringify({
        repo: state.repo,
        issue: state.issue,
        matched_label: state.matched_label,
        issue_context: state.payload?.issue_context,
        updater_deployment_access_id: state.updater_deployment_access_id,
        updater_step_id: state.updater_update_issue_step_id,
        outcome_label: state.pr_review_only === true ? "pr review" : state.matched_label,
        return_assignee: normStr(state.payload?.issue_context?.user?.login).trim()
      })), "consume-ai-action-trigger");
    }

    // Build invoke payload
    var callbackContext = {
      pr_review_only: state.pr_review_only === true,
      pull_number: state.pull_number,
      repo: state.repo,
      issue: state.issue,
      matched_label: state.matched_label,
      base_branch: state.base_branch,
      issue_body: state.payload?.issue_body,
      updater_deployment_access_id: state.updater_deployment_access_id,
      updater_add_comment_step_id: state.updater_add_comment_step_id,
      updater_update_issue_step_id: state.updater_update_issue_step_id,
      updater_delete_comment_step_id: state.updater_delete_comment_step_id,
      workflow: state.workflow,
      provider: state.ai.provider,
      model: state.ai.model,
      reasoning_effort: state.ai.reasoning_effort,
      verbosity: state.ai.verbosity,
      request_id: state.request_id,
      idempotency_key: state.idempotency_key,
      issue_context: state.payload?.issue_context ?? {}
    };
    if (typeof state.start_comment_id === "number" && isFinite(state.start_comment_id)) {
      callbackContext.start_comment_id = state.start_comment_id;
    }

    var invokePayload = {
      operation: state.operation || "refine",
      workflow: state.workflow,
      repo: state.repo,
      issue: state.issue,
      updated_at: state.payload?.updated_at,
      title: state.payload?.title,
      issue_body: state.payload?.issue_body,
      instructions: state.payload?.instructions,
      base_branch: state.base_branch,
      work_branch: state.work_branch,
      repositories: Array.isArray(state.repositories) ? state.repositories : [],
      comments: state.payload?.comments,
      issue_context: state.payload?.issue_context,
      reason: state.payload?.reason,
      ai: {
        provider: state.ai.provider,
        model: state.ai.model,
        reasoning_effort: state.ai.reasoning_effort,
        verbosity: state.ai.verbosity
      },
      request_id: state.request_id,
      idempotency_key: state.idempotency_key,
      callback_context: callbackContext
    };

    // Invoke
    var response = context.sendToStep("invoke-cli-sidecar-reviewer", JSON.stringify(invokePayload));
    var responseBody = normalizeResponse(parseStepBodyStrict(response, "invoke-cli-sidecar-reviewer"));

    // Rate limited check
    if (isLimited(responseBody)) {
      context.setBody(JSON.stringify(responseBody));
      emitMetric(state, "failure", { error: "true", error_code: "rate_limited", error_message: responseBody?.error?.message || "rate limited", retryable: true });
      return;
    }

    // Explicit error path
    if (responseBody?.error) {
      try {
        handleFailure(responseBody);
      } catch (e) {
        logDiagnostic("refine-invoke handleFailure updater failed", {
          repo: state.repo,
          issue: state.issue,
          error: String(e?.message ?? e)
        });
        context.setBody(JSON.stringify({
          queued: false,
          status: "error",
          operation: "refine",
          request_id: state.request_id,
          idempotency_key: state.idempotency_key,
          error: responseBody?.error ?? { code: "invoke_not_accepted", message: "invoke-cli-sidecar-reviewer did not accept async request", retryable: true },
          response: responseBody
        }));
        throw e;
      }
      context.setBody(JSON.stringify({
        queued: false,
        status: "error",
        operation: "refine",
        request_id: state.request_id,
        idempotency_key: state.idempotency_key,
        error: responseBody?.error ?? { code: "invoke_not_accepted", message: "invoke-cli-sidecar-reviewer did not accept async request", retryable: true },
        response: responseBody
      }));
      emitMetric(state, "failure", { error: "true", error_code: responseBody?.error?.code, error_message: responseBody?.error?.message, retryable: responseBody?.error?.retryable });
      return;
    }

    // Set in progress label
    callUpdater(state.updater_update_issue_step_id, {
      repo: state.repo,
      issue: state.issue,
      labels: buildInProgress(state.payload?.issue_context, state.matched_label)
    }, "update-issue");

    emitMetric(state, "accepted");

    context.setBody(JSON.stringify({
      queued: true,
      status: "ok",
      operation: "refine",
      request_id: state.request_id,
      idempotency_key: state.idempotency_key,
      response: responseBody
    }));
  });
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
      var detail = {
        step_id: sourceStepId
      };
      try {
        var bodyText = response.getBody();
        if (bodyText) {
          try {
            detail.body = JSON.parse(bodyText);
          } catch (e) {
            detail.body = bodyText;
          }
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
