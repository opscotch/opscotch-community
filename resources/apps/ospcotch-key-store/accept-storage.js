doc
  .description("Persist immutable public and secret key records")
  .asUserErrors()
  .inSchema({
    oneOf: [
      {
        type: "object",
        required: ["operation", "pairId", "publicRecordId", "secretRecordId", "includeSecret"],
        additionalProperties: false,
        properties: {
          operation: { const: "getPair" },
          pairId: { type: "string", minLength: 1, maxLength: 128 },
          publicRecordId: { type: "string", minLength: 1, maxLength: 128 },
          secretRecordId: { type: "string", minLength: 1, maxLength: 128 },
          includeSecret: { type: "boolean" }
        }
      },
      {
        type: "object",
        required: ["operation", "pairId", "publicRecordId", "secretRecordId", "publicRecord", "secretRecord"],
        additionalProperties: false,
        properties: {
          operation: { const: "putPairIfAbsent" },
          pairId: { type: "string", minLength: 1, maxLength: 128 },
          publicRecordId: { type: "string", minLength: 1, maxLength: 128 },
          secretRecordId: { type: "string", minLength: 1, maxLength: 128 },
          publicRecord: { type: "object" },
          secretRecord: { type: "object" }
        }
      }
    ]
  })
  .run(() => {
    const input = JSON.parse(context.getBody());
    try {
      context.sendMetric(`key-store-storage.requests.${input.operation}`, 1);
    } catch (error) {
      // Observability must not change the request outcome.
    }
    const response = context.sendToStep("storage-provider", context.getBody());
    if (response.isErrored()) throw new Error("storage provider unavailable");
    context.setBody(response.getBody());
  });
