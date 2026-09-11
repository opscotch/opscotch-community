doc
  .description("Build request payload for local CLI sidecar developer invoke")
  .asUserErrors()
  .inSchema({
    type: "object",
    required: ["repo", "issue", "request_id", "idempotency_key", "title", "issue_body", "instructions", "base_branch", "work_branch", "workflow", "ai", "callback_context"],
    additionalProperties: true,
    properties: {
      repo: { type: "string", description: "Repository in owner/repo format" },
      issue: { oneOf: [{ type: "number" }, { type: "string" }], description: "Issue number" },
      title: { type: "string", description: "Issue title" },
      issue_body: { type: ["string", "null"], description: "Issue or PR body; GitHub returns null when empty" },
      comments: { type: "array", description: "Issue comments", items: { type: "object", additionalProperties: true } },
      updated_at: { type: "string", description: "Last update timestamp" },
      request_id: { type: "string", description: "Request ID" },
      idempotency_key: { type: "string", description: "Idempotency key" },
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
      },
      instructions: { type: "string", description: "Instructions for the agent" },
      workflow: { type: "string", description: "Workflow name" },
      model: { type: "string", description: "Model to use" },
      base_branch: { type: "string", description: "Base branch" },
      work_branch: { type: "string", description: "Working branch" },
      callback_context: { type: "object", description: "Callback context" }
    }
  })
  .dataSchema({
    type: "object",
    required: ["cliSidecarDeveloperCallbackUrl", "cliSidecarDeveloperCallbackToken"],
    additionalProperties: true,
    properties: {
      cliSidecarDeveloperCallbackUrl: { type: "string", minLength: 1, description: "Callback URL for CLI sidecar" },
      cliSidecarDeveloperCallbackToken: { type: "string", minLength: 1, description: "Callback authentication token" }
    }
  })
  .outSchema({
    type: "object",
    properties: {
      schema: { type: "string", description: "Payload schema" }
    }
  })
  .run(() => {

    function normalizeIssue(value) {
      var issueNumber = parseInt(String(value), 10);
      if (isNaN(issueNumber) || issueNumber <= 0) {
        throw new Error("issue must be a positive integer");
      }
      return issueNumber;
    }

    function requireNonEmptyString(name, value) {
      var out = String(value ?? "").trim();
      if (!out) {
        throw new Error(name + " is required");
      }
      return out;
    }

    var payload = JSON.parse(context.getBody());
    var data = JSON.parse(context.getData());
    var operation = String(payload.operation ?? "develop").trim().toLowerCase() === "question" ? "question" : "develop";
    var repo = requireNonEmptyString("repo", payload.repo);
    var issue = normalizeIssue(payload.issue);
    var requestId = requireNonEmptyString("request_id", payload.request_id);
    var idempotencyKey = requireNonEmptyString("idempotency_key", payload.idempotency_key);
    var baseBranch = requireNonEmptyString("base_branch", payload.base_branch);
    var workBranch = requireNonEmptyString("work_branch", payload.work_branch);
    var title = requireNonEmptyString("title", payload.title);
    var issueBody = String(payload.issue_body ?? "");
    var provider = payload.ai.provider;
    var model = payload.ai.model;
    var reasoningEffort = payload.ai.reasoning_effort;
    var verbosity = payload.ai.verbosity;
    var instructions = requireNonEmptyString("instructions", payload.instructions);
    var workflow = requireNonEmptyString("workflow", payload.workflow);
    if (!payload.callback_context || typeof payload.callback_context !== "object" || Array.isArray(payload.callback_context)) {
      throw new Error("callback_context is required");
    }

    var requestBody = {
      schema: operation === "question" ? "opscotch.cli-sidecar.question.v1" : "opscotch.cli-sidecar.develop.v1",
      request_id: requestId,
      idempotency_key: idempotencyKey,
      operation: operation,
      base_branch: baseBranch,
      work_branch: workBranch,
      repositories: Array.isArray(payload.repositories) ? payload.repositories : [],
      input: {
        title: title,
        issue_body: issueBody,
        instructions: instructions,
        comments: Array.isArray(payload.comments) ? payload.comments : [],
        issue_context: payload.issue_context && typeof payload.issue_context === "object" ? payload.issue_context : {}
      },
      metadata: {
        workflow: workflow,
        repo: repo,
        provider: provider,
        model: model,
        reasoning_effort: reasoningEffort,
        verbosity: verbosity,
        callback_context: payload.callback_context
      },
      callback: {
        method: "POST",
        url: data.cliSidecarDeveloperCallbackUrl,
        headers: {
          "x-cli-sidecar-callback-token": data.cliSidecarDeveloperCallbackToken
        }
      }
    };

    context.setBody(JSON.stringify(requestBody));
  });
