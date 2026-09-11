doc
  .description("Build POST URL and headers for CLI sidecar reviewer invoke endpoint")
  .asUserErrors()
  .dataSchema({
    type: "object",
    additionalProperties: true,
    properties: {
      cliSidecarGatewayHostId: {
        description: "Bootstrap host id for the local CLI sidecar gateway endpoint.",
        type: "string"
      },
      cliSidecarReviewerAgent: {
        description: "Reviewer agent name used to build /agents/{agent}/invoke.",
        type: "string"
      }
    }
  })
  .run(() => {
    var data = JSON.parse(context.getData());
    var hostId = String(data.cliSidecarGatewayHostId ?? "cli-sidecar-local-gateway").trim() || "cli-sidecar-local-gateway";
    var agent = String(data.cliSidecarReviewerAgent ?? "reviewer").trim() || "reviewer";
    var path = "/agents/" + encodeURIComponent(agent) + "/invoke";

    context.setHttpMethod("POST");
    context.setUrl(hostId, path);
    context.setHeader("Content-Type", "application/json");
    context.setHeader("Accept", "application/json");
  });
