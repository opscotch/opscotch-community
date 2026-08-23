doc
  .description("Compile a JSON Schema pattern that uses POSIX \\s so native images load JCodings CR_Space.bin")
  .asUserErrors()
  .inSchema({
    type: "object",
    required: ["fromEmail"],
    additionalProperties: false,
    properties: {
      fromEmail: {
        type: "string",
        minLength: 3,
        maxLength: 254,
        pattern: "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$"
      }
    }
  })
  .run(() => {
    context.sendMetric("json-schema-pattern-posix-space-pass", 1.0);
  });
