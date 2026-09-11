doc
  .description("Build request payload for local CLI sidecar developer invoke (PR update)")
  .asUserErrors()
  .inSchema({
    type: "object",
    required: ["repo", "issue", "base_branch", "work_branch", "ai"],
    additionalProperties: true,
    properties: {
      repo: { type: "string", description: "Repository in owner/repo format" },
      issue: { oneOf: [{ type: "number" }, { type: "string" }], description: "Issue number" },
      base_branch: { type: "string", description: "Base branch" },
      work_branch: { type: "string", description: "Working branch" },
      title: { type: "string", description: "Issue title" },
      issue_body: { type: ["string", "null"], description: "Issue or PR body; GitHub returns null when empty" },
      instructions: { type: "string", description: "Instructions" },
      comments: { type: "array", description: "Comments", items: { type: "object" } },
      request_id: { type: "string", description: "Request ID" },
      idempotency_key: { type: "string", description: "Idempotency key" },
      workflow: { type: "string", description: "Workflow name" },
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
      updated_at: { type: "string", description: "Update timestamp" }
    }
  })
  .outSchema({
    type: "object",
    properties: {
      schema: { type: "string", description: "Payload schema" }
    }
  })
  .run(() => {

    function createUuidV4() {
      var timestamp = Date.now();
      return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
        var r = (timestamp + Math.random() * 16) % 16 | 0;
        timestamp = Math.floor(timestamp / 16);
        if (c === "x") return r.toString(16);
        return ((r & 0x3) | 0x8).toString(16);
      });
    }

    var payload = JSON.parse(context.getBody());
    var instructions = String(payload.instructions ?? "").trim();
    var requestId = String(payload.request_id ?? "").trim() || createUuidV4();
    var idempotencyKey = String(payload.idempotency_key ?? "").trim() || (String(payload.repo ?? "") + ":work-item:" + String(payload.updated_at ?? ""));
    var provider = payload.ai.provider;
    var model = payload.ai.model;
    var reasoningEffort = payload.ai.reasoning_effort;
    var verbosity = payload.ai.verbosity;

    var requestBody = {
      schema: "opscotch.cli-sidecar.develop.v1",
      request_id: requestId,
      idempotency_key: idempotencyKey,
      operation: "develop",
      base_branch: String(payload.base_branch ?? "main"),
      work_branch: String(payload.work_branch ?? ""),
      repositories: Array.isArray(payload.repositories) ? payload.repositories : [],
      input: {
        title: String(payload.title ?? ""),
        issue_body: String(payload.issue_body ?? ""),
        instructions: instructions,
        comments: Array.isArray(payload.comments) ? payload.comments : []
      },
      metadata: {
        workflow: String(payload.workflow ?? "quick-spec"),
        repo: String(payload.repo ?? ""),
        provider: provider,
        model: model,
        reasoning_effort: reasoningEffort,
        verbosity: verbosity
      }
    };

    context.setBody(JSON.stringify(requestBody));
  });
