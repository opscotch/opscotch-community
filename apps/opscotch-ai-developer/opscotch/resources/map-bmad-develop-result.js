doc
  .description("Map CLI sidecar develop response to normalized task status")
  .asUserErrors()
  .inSchema({
    type: "object",
    required: ["repo", "issue"],
    additionalProperties: true,
    properties: {
      repo: { type: "string", description: "Repository in owner/repo format" },
      issue: { oneOf: [{ type: "number" }, { type: "string" }], description: "Issue number" },
      run_id: { type: "string", description: "Run ID" },
      idempotency_key: { type: "string", description: "Idempotency key" },
      started_at: { type: "string", description: "Started timestamp" },
      response: { type: "object", additionalProperties: true, description: "Response object" }
    }
  })
  .outSchema({
    type: "object",
    properties: {
      repo: { type: "string", description: "Repository" },
      issue: { type: "number", description: "Issue number" },
      run_id: { type: "string", description: "Run ID" },
      idempotency_key: { type: "string", description: "Idempotency key" },
      request_id: { type: "string", description: "Request ID" },
      status: { type: "string", description: "Status" },
      raw_status: { type: "string", description: "Raw status" },
      completed_at: { type: "string", description: "Completion timestamp" },
      duration_ms: { type: "number", description: "Duration in ms" },
      response: { type: "object", description: "Response" },
      error_code: { type: "string", description: "Error code" },
      error_message: { type: "string", description: "Error message" },
      retryable: { type: "boolean", description: "Whether retryable" }
    }
  })
  .run(() => {

    function parseDateMs(value) {
      if (!value) return null;
      var t = Date.parse(String(value));
      return isNaN(t) ? null : t;
    }

    var payload = JSON.parse(context.getBody());
    var response = payload && typeof payload.response === "object" ? payload.response : {};
    var status = String(response.status ?? "unknown").toLowerCase();
    var isSuccess = status === "ok";

    var startedAt = String(payload.started_at ?? "");
    var startedMs = parseDateMs(startedAt);
    var nowMs = context.getTimestamp();
    var durationMs = startedMs === null ? null : Math.max(0, nowMs - startedMs);

    var error = response && typeof response.error === "object" ? response.error : null;
    var result = {
      repo: String(payload.repo ?? ""),
      issue: payload.issue,
      run_id: String(payload.run_id ?? ""),
      idempotency_key: String(payload.idempotency_key ?? ""),
      request_id: String(response.request_id ?? ""),
      status: isSuccess ? "succeeded" : "failed",
      raw_status: status,
      completed_at: new Date(nowMs).toISOString(),
      duration_ms: durationMs,
      response: response,
      error_code: error ? String(error.code ?? "") : "",
      error_message: error ? String(error.message ?? "") : "",
      retryable: error && error.retryable !== undefined ? !!error.retryable : false
    };

    context.setBody(JSON.stringify(result));
  });
