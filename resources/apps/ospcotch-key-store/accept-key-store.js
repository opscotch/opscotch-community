doc
  .description("Validate and route deployment-access key-store requests")
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
              keyId: {
                type: "string",
                minLength: 1,
                maxLength: 256
              },
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
              keyId: {
                type: "string",
                minLength: 1,
                maxLength: 256
              },
              purpose: {
                type: "string",
                enum: ["sign", "authenticated", "symmetric", "anonymous"]
              }
            }
          }
        }
      },
    ]
  })
  .run(() => {
    const request = JSON.parse(context.getBody());
    const operation = Object.keys(request)[0];
    const input = request[operation];
    const emitMetric = (name) => {
      try {
        context.sendMetric(name, 1);
        context.diagnosticLog(name);
      } catch (error) {
        // Observability must not change the request outcome.
      }
    };
    emitMetric(`key-store.requests.${operation}`);

    const stepByOperation = {
      get: "key-store-get",
      getOrGenerate: "key-store-get-or-generate"
    };
    const response = context.sendToStep(
      stepByOperation[operation],
      JSON.stringify(Object.assign({ operation }, input))
    );
    if (response.isErrored()) {
      emitMetric(`key-store.requests.${operation}.failed`);
      throw new Error(response.getAllErrors()[0]);
    }
    context.setBody(response.getBody());
  });
