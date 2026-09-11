doc
  .description("Acknowledge CLI sidecar refine callback and process it asynchronously")
  .asUserErrors()
  .inSchema({
    properties: {
      request_id: { type: "string", description: "Unique identifier for the callback request" },
      status: { type: "string", description: "Status of the operation" },
      operation: { type: "string", description: "The operation performed" }
    }
  })
  .outSchema({
    type: "object",
    properties: {
      status: { type: "string", enum: ["ok", "error"], description: "Response status" },
      request_id: { type: "string", description: "The request ID from the callback" },
      code: { type: "string", description: "Error code when unauthorized" },
      message: { type: "string", description: "Error message when unauthorized" }
    }
  })
  .dataSchema({
    type: "object",
    additionalProperties: true,
    properties: {
      cliSidecarReviewerCallbackToken: { type: "string", description: "Expected callback auth token" }
    }
  })
  .run(() => {

    function logDiagnostic(message, details) {
      var line = message + (details ? ": " + JSON.stringify(details) : "");
      context.diagnosticLog(line);
    }

    // Agent getHeader returns a JSON array string; resource-testkit returns a plain string.
    function firstHeaderValue(name) {
      var raw = context.getHeader(name);
      if (raw == null || raw === "") {
        return "";
      }
      try {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return String(parsed[0] ?? "").trim();
        }
      } catch (e) {
        // plain-string header (unit-test shim)
      }
      return String(raw).trim();
    }

    var body = JSON.parse(context.getBody());
    var requestId = body.request_id ?? "";
    var data = {};
    try {
      data = JSON.parse(context.getData() || "{}");
    } catch (e) {
      data = {};
    }
    var expectedToken = String(data.cliSidecarReviewerCallbackToken ?? "").trim();
    var suppliedToken = firstHeaderValue("x-cli-sidecar-callback-token");
    function emitErrorMetric(errorCode) {
      var metadata = { error: "true", operation: "refine", stage: "callback", error_code: errorCode, request_id: String(requestId || "") };
      context.sendMetric(context.getTimestamp(), "opscotch_ai_developer.errors", 1.0, metadata);
      context.sendMetric(context.getTimestamp(), "opscotch_ai_developer.refine.errors", 1.0, metadata);
    }

    if (!expectedToken || suppliedToken !== expectedToken) {
      emitErrorMetric("invalid_callback_token");
      context.setProperty("status_code", "401");
      context.setBody(JSON.stringify({
        status: "error",
        code: "invalid_callback_token",
        message: "Unauthorized",
        request_id: requestId
      }));
      logDiagnostic("callback-unauthorized", { request_id: requestId, operation: "refine" });
      return;
    }

    context.setProperty("status_code", "200");
    context.setBody(JSON.stringify({ status: "ok", request_id: requestId }));

    context.sendToStepAndForget("dispatch-bmad-refine-callback-worker", JSON.stringify(body));

    logDiagnostic("refine-callback queued", {
      request_id: requestId,
      status: body.status ?? "",
      operation: body.operation ?? ""
    });
  });
