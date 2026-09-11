doc
  .description("Dispatch non-triage: observe-only handler for unhandled tickets")
  .asUserErrors()
  .inSchema({
    type: "object",
    additionalProperties: true,
    properties: {}
  })
  .outSchema({
    type: "object",
    properties: {
      handled: { type: "boolean", description: "Whether payload was handled" },
      action: { type: "string", description: "Action taken" },
      payload: { type: "object", description: "Original payload" }
    }
  })
  .run(() => {

    var payload = JSON.parse(context.getBody());
    context.setBody(JSON.stringify({
      handled: true,
      action: "observe-only",
      payload: payload
    }));
  });
