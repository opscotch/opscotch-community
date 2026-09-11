doc
  .description("Forward develop requests into the queue processor step")
  .asUserErrors()
  .inSchema({
    type: "object",
    required: ["repo", "issue"],
    additionalProperties: true,
    properties: {
      repo: { type: "string", description: "Repository in owner/repo format" },
      issue: { oneOf: [{ type: "number" }, { type: "string" }], description: "Issue number or string" },
      updated_at: { type: "string", description: "Update timestamp" },
      operation: { type: "string", description: "Operation type" }
    }
  })
  .outSchema({
    type: "object",
    properties: {
      queued: { type: "boolean", description: "Whether request was queued" },
      routed: { type: "boolean", description: "Whether request was routed" },
      status: { type: "string", enum: ["accepted", "duplicate"], description: "Queue status" }
    }
  })
  .run(() => {

    // Parse body
    var payload = JSON.parse(context.getBody());

    // Helpers using nullish coalescing
    function normStr(value) {
      return String(value ?? "");
    }

    function normalizeIssueNum(value) {
      var num = parseInt(value, 10);
      if (isNaN(num) || num <= 0) throw new Error("issue must be a positive integer");
      return num;
    }

    function normalizeRepo(value) {
      var repo = normStr(value).trim();
      if (!repo || !repo.includes("/")) throw new Error("repo must be in owner/repo format");
      return repo;
    }

    // Normalize payload
    payload.repo = normalizeRepo(payload.repo);
    payload.issue = normalizeIssueNum(payload.issue);
    payload.operation = "develop";
    payload.trigger_condition = {
      kind: "label",
      matched_label: normStr(payload.matched_label),
      expected_step_id: "dispatch-bmad-develop"
    };

    // Build idempotency key
    var updatedAt = normStr(payload.updated_at ?? payload.issue_context?.updated_at);
    var idempotencyKey = payload.repo + ":" + payload.issue + ":" + updatedAt + ":develop";

    // Reserve dispatch slot
    var reserveResponse = context.sendToStep("track-bmad-develop-status", JSON.stringify({
      operation: "reserve-dispatch",
      repo: payload.repo,
      issue: payload.issue,
      idempotency_key: idempotencyKey
    }));
    if (reserveResponse.isErrored()) {
      throw new Error("track-bmad-develop-status reserve-dispatch step errored");
    }
    var reserveBody = JSON.parse(reserveResponse?.getBody() ?? "{}");

    // Duplicate check
    if (reserveBody?.reserved !== true) {
      context.setBody(JSON.stringify({
        queued: true,
        routed: false,
        operation: "develop",
        repo: payload.repo,
        issue: payload.issue,
        idempotency_key: idempotencyKey,
        status: "duplicate",
        duplicate: true,
        active: reserveBody?.active
      }));
      return;
    }

    // Forward to queue processor
    try {
      context.sendToStepAndForget("process-bmad-develop-queue", JSON.stringify(payload));
    } catch (err) {
      context.sendToStepAndForget("track-bmad-develop-status", JSON.stringify({
        operation: "release-dispatch",
        repo: payload.repo,
        issue: payload.issue,
        idempotency_key: idempotencyKey
      }));
      throw err;
    }

    context.setBody(JSON.stringify({
      queued: true,
      routed: true,
      operation: "develop",
      repo: payload.repo,
      issue: payload.issue,
      idempotency_key: idempotencyKey,
      status: "accepted"
    }));
  });
