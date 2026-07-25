doc
  .description("Validate and route administrative key-store imports")
  .asUserErrors()
  .inSchema({
    type: "object",
    required: ["load"],
    additionalProperties: false,
    properties: {
      load: {
        type: "object",
        required: ["keyId", "purpose", "keyPair"],
        additionalProperties: false,
        properties: {
          keyId: {
            type: "string",
            minLength: 1,
            maxLength: 256
          },
          purpose: {
            type: "string",
            enum: ["sign", "authenticated", "symmetric", "anonymous"]
          },
          keyPair: {
            type: "object",
            required: ["publicKeyHex", "secretKeyHex"],
            additionalProperties: false,
            properties: {
              publicKeyHex: { type: ["string", "null"], minLength: 1 },
              secretKeyHex: { type: "string", minLength: 1 }
            }
          }
        }
      }
    }
  })
  .run(() => {
    const request = JSON.parse(context.getBody());
    const input = request.load;
    const response = context.sendToStep(
      "key-store-admin-call",
      "key-store-operation",
      JSON.stringify({ operation: "load", ...input })
    );
    if (response.isErrored()) throw new Error(response.getAllErrors()[0]);
    context.setBody(response.getBody());
  });
