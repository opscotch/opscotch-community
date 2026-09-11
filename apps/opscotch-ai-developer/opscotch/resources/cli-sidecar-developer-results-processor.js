doc
  .description("Process CLI sidecar developer response")
  .asUserErrors()
  .inSchema({
    type: "object",
    properties: {
      status: { type: "string", description: "Response status" },
      request_id: { type: "string", description: "Request ID" },
      output: { type: "object", description: "Response output" },
      error: { type: "object", description: "Error details" }
    }
  })
  .outSchema({
    type: "object",
    properties: {
      dispatcher: { type: "string", description: "Dispatcher name" },
      schema: { type: "string", description: "Response schema" },
      operation: { type: "string", description: "Operation type" },
      request_id: { type: "string", description: "Request ID" },
      output: { type: "object", description: "Output data" },
      error: { type: "object", description: "Error details" },
      response: { type: "object", description: "Raw response" }
    }
  })
  .run(() => {

    function logDiagnostic(message, details) {
      var line = message + (details ? ": " + JSON.stringify(details) : "");
      context.diagnosticLog(line);
    }

    function toLower(value) {
      return String(value ?? "").toLowerCase();
    }

    function classifyHandling(errorCode) {
      var code = toLower(errorCode);
      if (code === "base_branch_not_found") {
        return {
          recommended_action: "stop",
          retry_strategy: "do_not_retry_until_repo_or_branch_selection_fixed"
        };
      }
      if (code.indexOf("_checkout_failed") >= 0 || code.indexOf("_track_failed") >= 0 || code.indexOf("_create_failed") >= 0) {
        return {
          recommended_action: "retry_conditionally",
          retry_strategy: "retry_only_after_repo_state_changes"
        };
      }
      if (code === "push_failed") {
        return {
          recommended_action: "retry_conditionally",
          retry_strategy: "retry_after_remote_or_credentials_check"
        };
      }
      if (code === "agent_failed") {
        return {
          recommended_action: "retry_with_cap",
          retry_strategy: "retryable_but_with_hard_cap"
        };
      }
      return {
        recommended_action: "retry_conditionally",
        retry_strategy: "retry_based_on_error.retryable"
      };
    }

    function normalizeError(upstream) {
      var sourceError = upstream?.error && typeof upstream.error === "object" ? upstream.error : {};
      var code = String(sourceError.code ?? "agent_failed");
      var message = String(sourceError.message ?? "Agent process failed");
      var retryable = sourceError.retryable !== undefined ? !!sourceError.retryable : true;
      var details = sourceError.details && typeof sourceError.details === "object" ? sourceError.details : undefined;
      var handling = classifyHandling(code);
      return {
        code: code,
        message: message,
        retryable: retryable,
        details: details,
        handling: handling
      };
    }

    var upstream = JSON.parse(context.getBody());

    logDiagnostic("cli-sidecar develop response", {
      response: upstream
    });

    var envelope = {
      dispatcher: "cli-sidecar-local-gateway",
      schema: "opscotch.cli-sidecar.develop-result.v1",
      operation: "develop",
      request_id: upstream.request_id ?? "",
      output: upstream.output ?? {},
      response: upstream
    };

    if (upstream && typeof upstream.error === "object") {
      envelope.error = normalizeError(upstream);
    }

    context.setBody(JSON.stringify(envelope));
  });
