doc
  .description("Build POST URL and headers for wrapper log_fetch endpoint")
  .asUserErrors()
  .dataSchema({
    type: "object",
    required: ["cliSidecarGatewayHostId"],
    properties: {
      cliSidecarGatewayHostId: {
        description: "Bootstrap host id for the local CLI sidecar gateway endpoint.",
        type: "string"
      }
    }
  })
  .run(() => {
    var hostId = context.getData("cliSidecarGatewayHostId").trim();

    context.setHttpMethod("POST");
    context.setUrl(hostId, "/log_fetch");
    context.setHeader("Content-Type", "application/json");
    context.setHeader("Accept", "application/json");
  });
