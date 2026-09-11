doc
  .description("Fetch run log content using repo+run_id with local cache")
  .asUserErrors()
  .inSchema({
    type: "object",
    required: ["repo", "run_id"],
    properties: {
      repo: { type: "string", description: "Repository in owner/repo format" },
      run_id: { type: "number", description: "GitHub Actions run id" }
    }
  })
  .dataSchema({
    type: "object",
    properties: {
      githubActionRunnerDeploymentAccessId: { type: "string", description: "Deployment access id for GitHub Actions lookups" },
      githubActionGetFailingStepStepId: { type: "string", description: "Step ID for failing-step lookup" },
      githubActionGetJobLogsStepId: { type: "string", description: "Step ID for job log lookup" }
    }
  })
  .outSchema({
    type: "object",
    required: ["status", "operation", "repo", "run_id", "cache_path", "cache_hit", "logs"],
    properties: {
      status: { type: "string" },
      operation: { type: "string" },
      repo: { type: "string" },
      run_id: { type: "number" },
      cache_path: { type: "string" },
      cache_hit: { type: "boolean" },
      logs_redirect_url: { type: "string" },
      logs: { type: "string" }
    }
  })
  .run(() => {

    function parseStepBodyStrict(response, sourceStepId) {
      if (response.isErrored()) {
        throw new Error(sourceStepId + " step errored");
      }
      var rawBody = response ? response.getBody() : "";
      if (rawBody === null || rawBody === undefined || rawBody === "") {
        return {};
      }
      if (typeof rawBody === "object") {
        throw new Error("Expected string body from " + sourceStepId + " but received object");
      }
      return JSON.parse(rawBody);
    }

    function sanitizeRepo(repo) {
      return repo.replace(/[^A-Za-z0-9._-]/g, "_");
    }

    var body = JSON.parse(context.getBody());
    var data = JSON.parse(context.getData() || "{}");
    var actionRunnerDeploymentAccessId = String(data.githubActionRunnerDeploymentAccessId || "github-action-runner-callers").trim() || "github-action-runner-callers";
    var actionGetFailingStepStepId = String(data.githubActionGetFailingStepStepId || "github-action-get-failing-step").trim() || "github-action-get-failing-step";
    var actionGetJobLogsStepId = String(data.githubActionGetJobLogsStepId || "github-action-get-job-logs").trim() || "github-action-get-job-logs";
    var repo = body.repo;
    var runId = body.run_id;
    var cachePath = "run-" + sanitizeRepo(repo) + "-" + runId + ".log";
    var failingStepResponse = context.sendToStep(actionRunnerDeploymentAccessId, actionGetFailingStepStepId, JSON.stringify({
      operation: "get-failing-step",
      repo: repo,
      run_id: runId
    }));
    var failingStepBody = parseStepBodyStrict(failingStepResponse, actionGetFailingStepStepId);
    var jobId = failingStepBody.job_id;

    try {
      var cached = context.files("run-logs-cache").read(cachePath);
      context.setBody(JSON.stringify({
        status: "ok",
        operation: "fetch-run-log-content",
        repo: repo,
        run_id: runId,
        cache_path: cachePath,
        cache_hit: true,
        logs_redirect_url: "",
        logs: cached
      }));
      return;
    } catch (ignoreCacheReadFailure) {
    }

    var logsResponse = context.sendToStep(actionRunnerDeploymentAccessId, actionGetJobLogsStepId, JSON.stringify({
      operation: "get-workflow-job-logs",
      repo: repo,
      job_id: jobId
    }));
    var logsBody = parseStepBodyStrict(logsResponse, actionGetJobLogsStepId);
    var redirectUrl = logsBody.redirect_location;
    var logsText = logsBody.logs;

    if ((logsText === null || logsText === undefined || logsText === "") && redirectUrl) {
      var fetchedLogsResponse = context.sendToStep("fetch-run-log-content-http", JSON.stringify({
        url: redirectUrl
      }));
      var fetchedLogsBody = parseStepBodyStrict(fetchedLogsResponse, "fetch-run-log-content-http");
      logsText = fetchedLogsBody.logs;
    }

    try {
      context.files("run-logs-cache").write(cachePath, logsText);
    } catch (ignoreCacheWriteFailure) {
    }

    context.setBody(JSON.stringify({
      status: "ok",
      operation: "fetch-run-log-content",
      repo: repo,
      run_id: runId,
      cache_path: cachePath,
      cache_hit: false,
      logs_redirect_url: redirectUrl,
      logs: logsText
    }));
  });
