doc
  .description("Build a structured error response for a failed CLI sidecar invoke")
  .asUserErrors()
  .outSchema({
    type: "object",
    required: ["queued", "status", "status_code", "agent", "request_id", "error", "response"],
    properties: {
      queued: { type: "boolean", description: "Whether the request was queued" },
      status: { type: "string", description: "Response status" },
      status_code: { type: "string", description: "HTTP status or connection failure marker" },
      agent: { type: "string", description: "CLI sidecar agent" },
      request_id: { type: "string", description: "Request ID" },
      error: {
        type: "object",
        required: ["code", "message", "retryable"],
        properties: {
          code: { type: "string", description: "Stable error code" },
          message: { type: "string", description: "Error message" },
          retryable: { type: "boolean", description: "Whether retrying may succeed" }
        }
      },
      response: { type: "object", description: "Original sidecar response, or raw response body" }
    }
  })
  .run(() => {
    var statusCode = String(context.getProperty("status_code") || "");
    var responseBody = context.getBody() || "";
    var agent = String(context.getProperty("cli_sidecar_agent") || "");
    var errors = [];
    try {
      errors = context.getAllErrors() || [];
    } catch (e) {
      errors = [];
    }

    var firstError = "";
    try {
      firstError = String(context.getFirstError(errors) || "");
    } catch (e) {
      firstError = "";
    }

    var parsedBody = {};
    try {
      parsedBody = JSON.parse(String(responseBody || "{}"));
    } catch (e) {
      parsedBody = {};
    }

    var requestId = String(
      parsedBody.request_id ||
      parsedBody.metadata?.callback_context?.request_id ||
      context.getProperty("request_id") ||
      ""
    );
    var upstreamError = parsedBody && typeof parsedBody.error === "object" ? parsedBody.error : null;
    var isConnectionFailure = !statusCode && !upstreamError;
    var errorCode = String(upstreamError?.code ?? (isConnectionFailure ? "cli_sidecar_connection_failed" : "cli_sidecar_http_failed"));
    var fallbackMessage = isConnectionFailure
      ? "Unable to connect to the CLI sidecar"
      : "CLI sidecar returned HTTP status " + statusCode;
    var errorMessage = String(upstreamError?.message || firstError || fallbackMessage);
    var response = Object.keys(parsedBody).length > 0
      ? parsedBody
      : { raw: String(responseBody) };

    context.addSystemError(errorMessage + (agent ? " for agent " + agent : ""));
    var sidecarMetadata = {
      error: "true",
      operation: "sidecar",
      agent: agent || "unknown",
      error_code: errorCode,
      status_code: statusCode || (isConnectionFailure ? "connection_failed" : "http_error"),
      retryable: String(upstreamError?.retryable !== false)
    };
    context.sendMetric(context.getTimestamp(), "opscotch_ai_developer.errors", 1.0, sidecarMetadata);
    context.sendMetric(context.getTimestamp(), "opscotch_ai_developer.sidecar.errors", 1.0, sidecarMetadata);
    context.setBody(JSON.stringify({
      queued: false,
      status: "error",
      status_code: statusCode || (upstreamError ? "http_error" : "connection_failed"),
      agent: agent,
      request_id: requestId,
      error: {
        code: errorCode,
        message: errorMessage,
        retryable: upstreamError?.retryable !== false
      },
      response: response
    }));
  });
