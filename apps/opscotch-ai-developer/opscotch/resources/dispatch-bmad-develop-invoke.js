doc
  .description("Invoke developer asynchronously and await callback")
  .asUserErrors()
  .inSchema({
    type: "object",
    required: [
      "repo",
      "issue",
      "request_id",
      "idempotency_key",
      "run_id",
      "started_at",
      "base_branch",
      "work_branch",
      "instructions",
      "ai",
      "payload"
    ],
    additionalProperties: true,
    properties: {
      repo: { type: "string", minLength: 3, pattern: "^[^/]+\\/[^/]+$", description: "Repository in owner/repo format" },
      issue: { type: "number", minimum: 1, description: "Issue number" },
      request_id: { type: "string", minLength: 1, description: "Unique request identifier" },
      idempotency_key: { type: "string", minLength: 1, description: "Key for deduplication" },
      queue_idempotency_key: { type: "string", description: "Queue-specific idempotency key" },
      run_id: { type: "string", minLength: 1, description: "Run identifier" },
      started_at: { type: "string", minLength: 1, description: "Start timestamp" },
      base_branch: { type: "string", minLength: 1, description: "Base branch name" },
      work_branch: { type: "string", minLength: 1, description: "Work branch name" },
      instructions: { type: "string", minLength: 1, description: "Instructions for developer" },
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
      payload: {
        type: "object",
        required: ["updated_at", "title", "issue_body"],
        additionalProperties: true,
        description: "Issue payload data",
        properties: {
          updated_at: { type: "string", minLength: 1, description: "Update timestamp" },
          title: { type: "string", minLength: 1, description: "Issue title" },
          issue_body: { type: ["string", "null"], description: "Issue body; GitHub returns null when empty" }
        }
      }
    }
  })
  .outSchema({
    type: "object",
    properties: {
      queued: { type: "boolean", description: "Whether request was queued" },
      status: { type: "string", enum: ["ok", "error"], description: "Request status" },
      request_id: { type: "string", description: "Request identifier" }
    }
  })
  .run(() => {

    // Parse state - getBody returns string
    var state = JSON.parse(context.getBody());
    var operation = String(state.operation ?? "develop").trim().toLowerCase() === "question" ? "question" : "develop";

    function emitMetric(outcome, extra) {
      var metricOperation = state.pull_number ? "pr_develop" : "develop";
      var metadata = { repo: state.repo, issue_or_pr: state.pull_number ?? state.issue, request_id: state.request_id, run_id: state.run_id, idempotency_key: state.idempotency_key };
      Object.keys(extra || {}).forEach(function(key) { metadata[key] = extra[key]; });
      context.sendToStepAndForget("emit-ai-developer-metric", JSON.stringify({
        operation: metricOperation,
        stage: "invoke",
        outcome: outcome,
        value: 1.0,
        metadata: outcome === "failure" ? Object.assign({}, metadata, { error: "true" }) : metadata
      }));
    }
    var invokePayload = {
      operation: operation,
      repo: state.repo,
      issue: state.issue,
      updated_at: state.payload?.updated_at,
      title: state.payload?.title,
      issue_body: state.payload?.issue_body,
      instructions: state.instructions,
      comments: state.payload?.comments,
      issue_context: state.payload?.issue_context,
      ai: {
        provider: state.ai.provider,
        model: state.ai.model,
        reasoning_effort: state.ai.reasoning_effort,
        verbosity: state.ai.verbosity
      },
      request_id: state.request_id,
      idempotency_key: state.idempotency_key,
      workflow: state.workflow,
      base_branch: state.base_branch,
      work_branch: state.work_branch,
      repositories: Array.isArray(state.repositories) ? state.repositories : [],
      callback_context: state
    };

    // Set pending state
    context.setPersistedItem("pending:" + state.request_id, JSON.stringify(state));
    context.setPersistedItem("pending-by-idempotency:" + (state.queue_idempotency_key ?? (state.idempotency_key + ":" + operation)), state.request_id);

    function extractStepError(response, fallbackCode, fallbackMessage) {
      var details = [];
      try {
        details = response.getAllErrors() ?? [];
      } catch (e) { /* ignore */ }
      var first = "";
      try {
        first = String(response.getFirstError(details) ?? "");
      } catch (e) { /* ignore */ }
      if (!first && details.length > 0) first = String(details[0] ?? "");
      return {
        code: fallbackCode,
        message: first || fallbackMessage,
        retryable: true,
        details: details
      };
    }

    // Invoke developer
    var response = context.sendToStep("invoke-cli-sidecar-developer", JSON.stringify(invokePayload));
    var rawBody = JSON.parse(response?.getBody() ?? "{}");
    if (response.isErrored()) {
      rawBody.error = rawBody?.error ?? extractStepError(
        response,
        "invoke_step_errored",
        "invoke-cli-sidecar-developer failed before request was accepted"
      );
    }

    // Normalize response
    var responseBody = rawBody;
    var nested = rawBody?.response;
    if (typeof nested === "string") {
      try { nested = JSON.parse(nested); } catch (e) { nested = null; }
    }
    if (nested && typeof nested === "object") {
      if (!rawBody.error && nested.error) rawBody.error = nested.error;
      if (!rawBody.request_id) rawBody.request_id = nested.request_id;
      if (!rawBody.operation) rawBody.operation = nested.operation;
      rawBody.response = nested;
    }
    if ((rawBody.status_code ?? rawBody.statusCode ?? "") === "429" && !rawBody.error) {
      rawBody.error = { code: "rate_limited", message: "CLI sidecar invoke already in progress", retryable: true };
    }
    responseBody = rawBody;

    // Helper: check rate limited
    function isLimited(body) {
      var code = (body?.error?.code ?? "").toLowerCase();
      if (code === "rate_limited") return true;
      var message = (body?.error?.message ?? "").toLowerCase();
      return message.includes("429") || message.includes("rate limit") || message.includes("already in progress");
    }

    // Helper: get label names
    function getLabels(issueContext) {
      return (issueContext?.labels ?? []).map(function(l) { return String(l?.name ?? l ?? "").trim(); }).filter(function(n) { return n; });
    }

    // Helper: build in-progress labels
    function buildInProgress(issueContext, matched) {
      var existing = getLabels(issueContext);
      var matchedLower = (matched ?? "").toLowerCase();
      var out = existing.filter(function(l) { return l.toLowerCase() !== matchedLower && l.toLowerCase() !== "in progress"; });
      out.push("in progress");
      return out;
    }

    // Helper: call updater
    function callUpdater(payload, opName) {
      var result = context.sendToStep(state.updater_deployment_access_id, state.updater_step_id, JSON.stringify(payload));
      if (result.isErrored()) {
        throw new Error("updater " + opName + " step errored");
      }
      var body = JSON.parse(result?.getBody() ?? "{}");
      if ((body.status ?? "").toLowerCase() !== "ok") {
        throw new Error("updater " + opName + " failed: " + JSON.stringify(body));
      }
      return body;
    }

    // === RATE LIMITED ===
    if (isLimited(responseBody)) {
      context.setPersistedItem("pending:" + state.request_id, "");
      context.setPersistedItem("pending-by-idempotency:" + (state.queue_idempotency_key ?? (state.idempotency_key + ":" + operation)), "");

      context.sendToStepAndForget("track-bmad-develop-status", JSON.stringify({
        operation: "release-dispatch",
        repo: state.repo,
        issue: state.issue,
        idempotency_key: state.queue_idempotency_key ?? (state.idempotency_key + ":" + operation)
      }));

      context.setBody(JSON.stringify(responseBody));
      emitMetric("failure", { error: "true", error_code: "rate_limited", error_message: responseBody?.error?.message || "rate limited", retryable: true });
      return;
    }

    // === EXPLICIT ERROR ===
    if (responseBody?.error) {
      context.setPersistedItem("pending:" + state.request_id, "");
      context.setPersistedItem("pending-by-idempotency:" + (state.queue_idempotency_key ?? (state.idempotency_key + ":" + operation)), "");

      context.setBody(JSON.stringify({
        queued: false,
        status: "error",
        operation: operation,
        request_id: state.request_id,
        run_id: state.run_id,
        idempotency_key: state.queue_idempotency_key ?? (state.idempotency_key + ":" + operation),
        error: responseBody?.error ?? {
          code: "invoke_not_accepted",
          message: "invoke-cli-sidecar-developer did not accept async request",
          retryable: true
        },
        response: responseBody
      }));
      emitMetric("failure", { error: "true", error_code: responseBody?.error?.code, error_message: responseBody?.error?.message, retryable: responseBody?.error?.retryable });
      return;
    }

    // === ACCEPTED/QUEUED ===
    callUpdater({
      operation: "update-issue",
      repo: state.repo,
      issue: state.issue,
      labels: buildInProgress(state.payload?.issue_context, state.payload?.matched_label)
    }, "update-issue");

    emitMetric("accepted");

    context.setBody(JSON.stringify({
      queued: true,
      status: "ok",
      operation: operation,
      request_id: state.request_id,
      run_id: state.run_id,
      idempotency_key: state.queue_idempotency_key ?? (state.idempotency_key + ":" + operation),
      response: responseBody
    }));
  });
