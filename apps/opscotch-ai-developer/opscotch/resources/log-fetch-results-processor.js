doc
  .description("Normalize wrapper log_fetch response")
  .asUserErrors()
  .inSchema({
    type: "object",
    required: ["status", "url", "logs"],
    properties: {
      status: { type: "string" },
      url: { type: "string" },
      logs: { type: "string" }
    }
  })
  .outSchema({
    type: "object",
    required: ["status", "operation"],
    properties: {
      status: { type: "string" },
      operation: { type: "string" },
      url: { type: "string" },
      logs: { type: "string" }
    }
  })
  .run(() => {

    var parsed = JSON.parse(context.getBody());
    context.setBody(JSON.stringify({
      status: parsed.status,
      operation: "log_fetch",
      url: parsed.url,
      logs: parsed.logs
    }));
  });
