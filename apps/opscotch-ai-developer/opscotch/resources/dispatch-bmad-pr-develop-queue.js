doc
  .description("Forward PR develop requests into the queue processor step")
  .asUserErrors()
  .inSchema({
    type: "object",
    required: ["repo", "pull_number"],
    additionalProperties: true,
    properties: {
      repo: { type: "string", description: "Repository in owner/repo format" },
      pull_number: { type: "number", description: "PR number" }
    }
  })
  .outSchema({
    type: "object",
    properties: {
      queued: { type: "boolean", description: "Whether request was queued" },
      routed: { type: "boolean", description: "Whether request was routed" },
      status: { type: "string", enum: ["accepted"], description: "Queue status" }
    }
  })
  .run(() => {

    // Parse body
    var payload = JSON.parse(context.getBody());
    var matchedLabel = String(payload.matched_label ?? "").trim().toLowerCase();
    payload.operation = matchedLabel === "question" ? "question" : "develop";

    // Forward to queue processor
    context.sendToStepAndForget("process-bmad-pr-develop-queue", JSON.stringify(payload));

    context.setBody(JSON.stringify({
      queued: true,
      routed: true,
      operation: payload.operation,
      repo: payload.repo,
      pull_number: payload.pull_number,
      status: "accepted"
    }));
  });
