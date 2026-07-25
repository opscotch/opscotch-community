doc
  .description("Forward an HTTP key-store request to the key-store deployment")
  .asUserErrors()
  .inSchema({
    oneOf: [
      {
        type: "object",
        required: ["get"],
        additionalProperties: false,
        properties: {
          get: {
            type: "object",
            required: ["keyId", "purpose"],
            additionalProperties: false,
            properties: {
              keyId: { type: "string", minLength: 1, maxLength: 256 },
              purpose: {
                type: "string",
                enum: ["sign", "authenticated", "symmetric", "anonymous"]
              }
            }
          }
        }
      },
      {
        type: "object",
        required: ["getOrGenerate"],
        additionalProperties: false,
        properties: {
          getOrGenerate: {
            type: "object",
            required: ["keyId", "purpose"],
            additionalProperties: false,
            properties: {
              keyId: { type: "string", minLength: 1, maxLength: 256 },
              purpose: {
                type: "string",
                enum: ["sign", "authenticated", "symmetric", "anonymous"]
              }
            }
          }
        }
      }
    ]
  })
  .run(() => {
    const request = JSON.parse(context.getBody());
    const body = JSON.parse(request.body);
    const operation = Object.keys(body)[0];
    const operationBody = { operation, ...body[operation] };
    context.removeAllHeaders();
    const response = context.sendToStep(
      "key-store-call",
      "key-store-operation",
      JSON.stringify(operationBody)
    );

    if (response.isErrored()) {
      const message = response.getAllErrors()[0];
      const clientError = message.indexOf("key not found") >= 0
        || message.indexOf("No oneOf passed") >= 0
        || message.indexOf("key record integrity failure") >= 0
        || message.indexOf("incomplete key pair") >= 0
        || message.indexOf("unsupported operation") >= 0
        || message.indexOf("secret seed required") >= 0;
      if (clientError) {
        context.setProperty("status_code", 400);
        context.setHeader("content-type", "application/json");
        context.setBody(JSON.stringify({
          error: message.indexOf("key not found") >= 0
            ? "key not found"
            : message.indexOf("key record integrity failure") >= 0
              ? "key record integrity failure"
              : "invalid key-store request"
        }));
        return;
      }
      throw new Error(message);
    }

    context.setHeader("content-type", "application/json");
    context.setBody(response.getBody());
  });
