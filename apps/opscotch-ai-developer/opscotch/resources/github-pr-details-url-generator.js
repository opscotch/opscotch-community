doc
  .description("Build GitHub PR details URL from repo and pull number")
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
  .dataSchema({
    type: "object",
    additionalProperties: true,
    properties: {
      hostId: { type: "string", description: "GitHub API host ID" }
    }
  })
  .run(() => {
    var data = JSON.parse(context.getData());
    var hostId = String(data.hostId ?? "github-api").trim() || "github-api";
    var payload = JSON.parse(context.getBody());
    var repo = String(payload.repo ?? "").trim();
    var pullNumber = parseInt(String(payload.pull_number), 10);

    if (!repo || repo.indexOf("/") < 0) {
      throw new Error("repo must be in owner/repo format");
    }
    if (isNaN(pullNumber) || pullNumber <= 0) {
      throw new Error("pull_number must be a positive integer");
    }

    context.setHttpMethod("GET");
    context.setUrl(hostId, "/repos/" + repo + "/pulls/" + pullNumber);
    context.setHeader("Accept", "application/vnd.github+json");
    context.setHeader("X-GitHub-Api-Version", "2022-11-28");
  });
