doc
  .description("Process CLI sidecar async develop callback and continue finalize flow")
  .asUserErrors()
  .inSchema({
    type: "object",
    description: "The callback payload",
    required: ["callback_context"],
    properties: {
      callback_context: { type: "object", description: "Embedded pending state" },
      request_id: { type: "string", description: "Request ID for fallback lookup" },
      idempotency_key: { type: "string", description: "Idempotency key for fallback lookup" }
    }
  })
  .outSchema({
    type: "object",
    properties: {
      status: { type: "string", enum: ["ok", "error"], description: "Final status" }
    }
  })
  .run(() => {

    // Load pending state from callback_context (preferred) or persistence fallback
    var body = JSON.parse(context.getBody());
    var state = body.callback_context;

    // Fallback: load from persistence if no embedded context
    if (!state) {
      var requestId = body.request_id;
      if (requestId) {
        state = JSON.parse(context.getPersistedItem("pending:" + requestId) ?? "null");
      }
      // Fallback: idempotency key lookup
      if (!state && body.idempotency_key) {
        var mappedId = context.getPersistedItem("pending-by-idempotency:" + body.idempotency_key);
        if (mappedId) {
          state = JSON.parse(context.getPersistedItem("pending:" + mappedId) ?? "null");
        }
      }
    }
    if (!state) {
      context.sendMetric(context.getTimestamp(), "opscotch_ai_developer.errors", 1.0, { error: "true", operation: "develop", stage: "callback", error_code: "pending_state_not_found" });
      context.sendMetric(context.getTimestamp(), "opscotch_ai_developer.develop.errors", 1.0, { error: "true", operation: "develop", stage: "callback", error_code: "pending_state_not_found" });
      context.setProperty("status_code", "404");
      context.setBody(JSON.stringify({ status: "error", message: "pending state not found" }));
      return;
    }
    var operation = String(state.operation ?? "develop").trim().toLowerCase() === "question" ? "question" : "develop";

    // Strip callback_context from body for result
    var callbackResult = { ...body };
    delete callbackResult.callback_context;

    // Map result
    var mappedResponse = context.sendToStep("map-bmad-develop-result", JSON.stringify({
      repo: state.repo,
      issue: state.issue,
      run_id: state.run_id,
      idempotency_key: state.queue_idempotency_key ?? (state.idempotency_key + ":" + operation),
      started_at: state.started_at,
      response: callbackResult
    }));
    if (mappedResponse.isErrored()) {
      throw new Error("map-bmad-develop-result step errored");
    }

    state.invoke_response = callbackResult;
    state.mapped = JSON.parse(mappedResponse?.getBody() ?? "{}");

    // Finalize and clear persistence
    var finalized = context.sendToStep("dispatch-bmad-develop-finalize", JSON.stringify(state));
    if (finalized.isErrored()) {
      throw new Error("dispatch-bmad-develop-finalize step errored");
    }
    if (state.request_id) {
      context.setPersistedItem("pending:" + state.request_id, "");
    }
    var key = state.queue_idempotency_key ?? (state.idempotency_key + ":" + operation);
    if (key) {
      context.setPersistedItem("pending-by-idempotency:" + key, "");
    }

    context.setProperty("status_code", "200");
    context.setBody(finalized ? finalized.getBody() : JSON.stringify({ status: "ok" }));
  });
