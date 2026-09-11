doc
  .description("Process CLI sidecar reviewer response")
  .asUserErrors()
  .inSchema({
    type: "object",
    properties: {
      request_id: { type: "string", description: "Request ID" },
      output: { type: "object", description: "Response output" },
      error: { type: "object", description: "Error details" }
    }
  })
  .outSchema({
    type: "object",
    properties: {
      dispatcher: { type: "string", description: "Dispatcher" },
      operation: { type: "string", description: "Operation" },
      request_id: { type: "string", description: "Request ID" },
      output: { type: "object", description: "Output" },
      error: { type: "object", description: "Error" },
      response: { type: "object", description: "Response" }
    }
  })
  .run(() => {

    function logDiagnostic(message, details) {
      var line = message + (details ? ": " + JSON.stringify(details) : "");
      context.diagnosticLog(line);
    }

    var upstream = JSON.parse(context.getBody());

    logDiagnostic("cli-sidecar invoke response", {
      response: upstream
    });

    var envelope = {
      dispatcher: "cli-sidecar-local-gateway",
      operation: "refine",
      request_id: upstream.request_id ?? "",
      output: upstream.output ?? {},
      response: upstream
    };
    if (upstream && typeof upstream.error === "object") {
      envelope.error = upstream.error;
    }

    context.setBody(JSON.stringify(envelope));
  });
