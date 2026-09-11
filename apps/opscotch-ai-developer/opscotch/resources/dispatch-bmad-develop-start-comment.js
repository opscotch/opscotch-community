doc
  .description("Post develop start comment")
  .asUserErrors()
  .inSchema({
    type: "object",
    required: [
      "repo",
      "issue",
      "request_id",
      "idempotency_key",
      "base_branch",
      "work_branch",
      "updater_deployment_access_id",
      "updater_step_id",
      "payload"
    ],
    additionalProperties: true,
    properties: {
      repo: { type: "string", minLength: 3, pattern: "^[^/]+\\/[^/]+$", description: "Repository in owner/repo format" },
      issue: { type: "number", minimum: 1, description: "Issue number" },
      request_id: { type: "string", minLength: 1, description: "Request identifier" },
      idempotency_key: { type: "string", minLength: 1, description: "Idempotency key" },
      queue_idempotency_key: { type: "string", description: "Queue-specific key" },
      run_id: { type: "string", description: "Run identifier" },
      base_branch: { type: "string", minLength: 1, description: "Base branch name" },
      work_branch: { type: "string", minLength: 1, description: "Work branch name" },
      workflow: { type: "string", description: "Workflow name" },
      updater_deployment_access_id: { type: "string", minLength: 1, description: "Deployment access id for updates" },
      updater_step_id: { type: "string", minLength: 1, description: "Step ID for updates" },
      payload: {
        type: "object",
        required: ["ai"],
        properties: {
          ai: {
            type: "object",
            additionalProperties: false,
            required: ["provider", "model", "reasoning_effort", "verbosity"],
            properties: {
              provider: { type: "string", enum: ["codex", "minimax"], description: "AI provider" },
              model: { type: "string", minLength: 1, description: "Model to use" },
              reasoning_effort: { type: "string", enum: ["none", "minimal", "low", "medium", "high", "xhigh"], description: "Reasoning effort" },
              verbosity: { type: "string", enum: ["low", "medium", "high"], description: "Verbosity" }
            }
          }
        }
      }
    }
  })
  .outSchema({
    type: "object",
    properties: {
      status: { type: "string", enum: ["ok"], description: "Operation status" }
    }
  })
  .run(() => {

    // Parse body
    var state = JSON.parse(context.getBody());

    // Helpers using nullish coalescing
    function normStr(value) {
      return String(value ?? "");
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

    // Call updater step
    function callUpdater(depId, stepId, payload, opName) {
      var result = context.sendToStep(depId, stepId, JSON.stringify(payload));
      if (result.isErrored()) {
        throw new Error("updater " + opName + " step errored");
      }
      var body = JSON.parse(result?.getBody() ?? "{}");
      if ((body.status ?? "").toLowerCase() !== "ok") {
        throw new Error("updater " + opName + " failed: " + JSON.stringify(body));
      }
      return body;
    }

    // Emit status
    function emitStatus(event) {
      try {
        context.sendToStepAndForget("track-bmad-develop-status", JSON.stringify(event));
      } catch (e) { /* ignore */ }
    }

    // Build comment
    var comment = [
      "Development started by CLI sidecar developer.",
      "",
      "- status: started",
      "- request_id: " + state.request_id,
      "- idempotency_key: " + state.idempotency_key,
      "- workflow: " + normStr(state.workflow),
      "- provider: " + state.payload.ai.provider,
      "- model: " + state.payload.ai.model,
      "- reasoning_effort: " + state.payload.ai.reasoning_effort,
      "- verbosity: " + state.payload.ai.verbosity,
      "- base_branch: " + state.base_branch,
      "- work_branch: " + state.work_branch,
      "",
      "<!-- OPSCOTCH_AI_DEVELOPER_OPERATIONAL -->"
    ].join("\n");

    var payload = {
      operation: "add-comment",
      repo: state.repo,
      issue: state.issue,
      comment: comment
    };

    try {
      callUpdater(state.updater_deployment_access_id, state.updater_step_id, payload, "add-comment");
    } catch (err) {
      emitStatus({
        operation: "update",
        idempotency_key: state.queue_idempotency_key ?? (state.idempotency_key + ":develop"),
        run_id: state.run_id ?? "",
        repo: state.repo,
        issue: state.issue,
        status: "failed",
        request_id: state.request_id,
        completed_at: new Date(context.getTimestamp()).toISOString(),
        error: "true",
        error_code: "start_comment_failed",
        error_message: "Unable to write develop start comment",
        retryable: false
      });
      throw new Error("Unable to write develop start comment");
    }

    context.setBody(JSON.stringify(state));
  });
