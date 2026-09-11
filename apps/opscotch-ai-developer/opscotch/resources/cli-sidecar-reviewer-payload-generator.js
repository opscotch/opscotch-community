doc
  .description("Build request payload for local CLI sidecar reviewer invoke")
  .asUserErrors()
  .inSchema({
    type: "object",
    required: ["repo", "request_id", "idempotency_key", "workflow", "ai", "base_branch", "title", "issue_body", "instructions", "callback_context"],
    additionalProperties: true,
    properties: {
      workflow: { type: "string", description: "Workflow name" },
      operation: { type: "string", description: "Operation type" },
      repo: { type: "string", description: "Repository in owner/repo format" },
      issue: { oneOf: [{ type: "number" }, { type: "string" }], description: "Issue number" },
      updated_at: { type: "string", description: "Update timestamp" },
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
      title: { type: "string", description: "Issue title" },
      issue_body: { type: ["string", "null"], description: "Issue or PR body; GitHub returns null when empty" },
      instructions: { type: "string", description: "Instructions" },
      base_branch: { type: "string", description: "Base branch" },
      comments: { type: "array", description: "Comments", items: { type: "object", additionalProperties: true } },
      issue_context: { type: "object", description: "Issue context" },
      callback_context: { type: "object", description: "Callback context" }
    }
  })
  .dataSchema({
    type: "object",
    required: ["cliSidecarReviewerCallbackUrl", "cliSidecarReviewerCallbackToken"],
    additionalProperties: true,
    properties: {
      cliSidecarReviewerCallbackUrl: { type: "string", minLength: 1, description: "Callback URL" },
      cliSidecarReviewerCallbackToken: { type: "string", minLength: 1, description: "Callback authentication token" }
    }
  })
  .outSchema({
    type: "object",
    properties: {
      schema: { type: "string", description: "Payload schema" }
    }
  })
  .run(() => {

    function logDiagnostic(message, details) {
      var line = message + (details ? ": " + JSON.stringify(details) : "");
      context.diagnosticLog(line);
    }

    function requireNonEmptyString(name, value) {
      var out = String(value ?? "").trim();
      if (!out) throw new Error(name + " is required");
      return out;
    }

    function sanitizeComments(comments) {
      if (!Array.isArray(comments)) return [];
      var normalized = [];
      for (var i = 0; i < comments.length; i += 1) {
        var comment = comments[i] ?? {};
        var user = comment.user ?? {};
        normalized.push({
          id: comment.id,
          node_id: comment.node_id,
          user: { login: user.login, id: user.id, node_id: user.node_id },
          created_at: comment.created_at,
          updated_at: comment.updated_at,
          body: comment.body
        });
      }
      return normalized;
    }

    function sanitizeUser(user, includeLogin) {
      var src = user ?? {};
      var out = { id: src.id, node_id: src.node_id, name: src.name };
      if (includeLogin) out.login = src.login;
      return out;
    }

    function sanitizeLabels(labels) {
      if (!Array.isArray(labels)) return [];
      var normalized = [];
      for (var i = 0; i < labels.length; i += 1) {
        var label = labels[i] ?? {};
        normalized.push({ id: label.id, node_id: label.node_id, name: label.name });
      }
      return normalized;
    }

    function sanitizeAssignees(assignees) {
      if (!Array.isArray(assignees)) return [];
      var normalized = [];
      for (var i = 0; i < assignees.length; i += 1) {
        normalized.push(sanitizeUser(assignees[i], true));
      }
      return normalized;
    }

    function sanitizeIssueContext(issueContext) {
      var src = issueContext ?? {};
      return {
        id: src.id,
        node_id: src.node_id,
        number: src.number,
        title: src.title,
        user: sanitizeUser(src.user, true),
        labels: sanitizeLabels(src.labels),
        state: src.state,
        assignees: sanitizeAssignees(src.assignees),
        milestone: src.milestone,
        created_at: src.created_at,
        updated_at: src.updated_at,
        closed_at: src.closed_at,
        assignee: sanitizeUser(src.assignee, false)
      };
    }

    var payload = JSON.parse(context.getBody());
    var data = JSON.parse(context.getData());

    var repo = requireNonEmptyString("repo", payload.repo);
    var requestId = requireNonEmptyString("request_id", payload.request_id);
    var idempotencyKey = requireNonEmptyString("idempotency_key", payload.idempotency_key);
    var workflow = requireNonEmptyString("workflow", payload.workflow);
    var baseBranch = requireNonEmptyString("base_branch", payload.base_branch);
    var provider = payload.ai.provider;
    var model = payload.ai.model;
    var reasoningEffort = payload.ai.reasoning_effort;
    var verbosity = payload.ai.verbosity;
    var title = requireNonEmptyString("title", payload.title);
    var issueBody = String(payload.issue_body ?? "");

    var instructions = requireNonEmptyString("instructions", payload.instructions);
    if (!payload.callback_context || typeof payload.callback_context !== "object" || Array.isArray(payload.callback_context)) {
      throw new Error("callback_context is required");
    }

    var operation = String(payload.operation ?? "refine").trim();
    var isQuestion = operation === "question";
    var requestBody = {
      schema: isQuestion ? "opscotch.cli-sidecar.question.v1" : "opscotch.cli-sidecar.refine.v1",
      request_id: requestId,
      idempotency_key: idempotencyKey,
      operation: isQuestion ? "question" : "refine",
      base_branch: baseBranch,
      work_branch: isQuestion ? String(payload.work_branch ?? "").trim() : undefined,
      repositories: Array.isArray(payload.repositories) ? payload.repositories : [],
      input: {
        title: title,
        issue_body: issueBody,
        comments: sanitizeComments(payload.comments),
        issue_context: sanitizeIssueContext(payload.issue_context),
        instructions: instructions
      },
      metadata: {
        workflow: workflow,
        repo: repo,
        provider: provider,
        model: model,
        reasoning_effort: reasoningEffort,
        verbosity: verbosity,
        review_only: payload.callback_context?.pr_review_only === true,
        callback_context: payload.callback_context
      },
      callback: {
        method: "POST",
        url: data.cliSidecarReviewerCallbackUrl,
        headers: {
          "x-cli-sidecar-callback-token": data.cliSidecarReviewerCallbackToken
        }
      }
    };

    logDiagnostic("cli-sidecar invoke request", requestBody);
    context.setBody(JSON.stringify(requestBody));
  });
