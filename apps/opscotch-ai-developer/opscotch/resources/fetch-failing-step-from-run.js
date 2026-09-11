doc
  .description("Debug helper: fetch failing step details for a GitHub Actions run")
  .asUserErrors()
  .inSchema({
    type: "object",
    required: ["run_id"],
    properties: {
      run_id: { type: "number", description: "Run ID to fetch failing step for" },
      builder_repo: { type: "string", description: "Repository (owner/repo)" },
      repo: { type: "string", description: "Repository alias" },
      body: { type: "object", description: "Nested body payload" }
    }
  })
  .dataSchema({
    type: "object",
    additionalProperties: true,
    properties: {
      githubActionRunnerDeploymentAccessId: { type: "string", description: "Deployment access id for GitHub Actions lookups" },
      githubActionGetFailingStepStepId: { type: "string", description: "Step ID for failing-step lookup" }
    }
  })
  .outSchema({
    type: "object",
    properties: {
      status: { type: "string", description: "Operation status" },
      error: { type: "string", description: "Error message if any" },
      run_id: { type: "number", description: "Run ID" },
      repo: { type: "string", description: "Repository" },
      failing_step: { type: "object", description: "Failing step details" },
      note: { type: "string", description: "Additional note" }
    }
  })
  .run(() => {

    function toInt(value) {
      var n = parseInt(String(value ?? ""), 10);
      return isNaN(n) ? 0 : n;
    }

    function debug(event, payload) {
      try {
        console.log("[debug-fetch-failing-step-from-run] " + event + " " + JSON.stringify(payload ?? {}));
      } catch (ignoreDebugLogFailure) {
      }
    }

    var input = JSON.parse(context.getBody());
    var payload = input;
    var payloadSource = "top-level";
    if (input && typeof input === "object" && input.body !== undefined) {
      if (typeof input.body === "string") {
        try {
          payload = JSON.parse(input.body);
          payloadSource = "input.body:string";
        } catch (e) {
          payload = {};
          payloadSource = "input.body:string-parse-error";
        }
      } else if (input.body && typeof input.body === "object") {
        payload = input.body;
        payloadSource = "input.body:object";
      }
    }

    var runId = toInt(payload.run_id);
    var repo = String(payload.builder_repo ?? payload.repo ?? "opscotch/builder").trim() || "opscotch/builder";
    debug("request.received", {
      run_id: runId,
      repo: repo,
      payload_source: payloadSource,
      input_keys: Object.keys(input ?? {}),
      payload_keys: payload && typeof payload === "object" ? Object.keys(payload) : []
    });

    if (runId <= 0) {
      debug("request.invalid", {
        reason: "run_id must be a positive integer",
        run_id: runId
      });
      context.sendMetric(context.getTimestamp(), "opscotch_ai_developer.errors", 1.0, { error: "true", operation: "build_tracking", stage: "tracking", error_code: "invalid_run_id" });
      context.sendMetric(context.getTimestamp(), "opscotch_ai_developer.build_tracking.errors", 1.0, { error: "true", operation: "build_tracking", stage: "tracking", error_code: "invalid_run_id" });
      context.setBody(JSON.stringify({
        status: "error",
        error: "run_id must be a positive integer"
      }));
      return;
    }

    var data = {};
    try {
      data = JSON.parse(context.getData() || "{}");
    } catch (e) {
      data = {};
    }
    var actionRunnerDeploymentAccessId = String(data.githubActionRunnerDeploymentAccessId || "github-action-runner-callers").trim() || "github-action-runner-callers";
    var actionGetFailingStepStepId = String(data.githubActionGetFailingStepStepId || "github-action-get-failing-step").trim() || "github-action-get-failing-step";

    var failingStepRequest = {
      operation: "get-failing-step",
      repo: repo,
      run_id: runId
    };
    debug("failing-step.request", failingStepRequest);
    var failingStepResponse = context.sendToStep(actionRunnerDeploymentAccessId, actionGetFailingStepStepId, JSON.stringify(failingStepRequest));
    if (failingStepResponse.isErrored()) {
      throw new Error("github-action-get-failing-step step errored");
    }
    var failingStep = JSON.parse(failingStepResponse?.getBody() ?? "{}");
    debug("failing-step.response", {
      status: failingStep.status ?? null,
      operation: failingStep.operation ?? null,
      run_id: failingStep.run_id ?? null,
      job_id: failingStep.job_id ?? null,
      failing_step_name: failingStep.failing_step_name ?? null,
      failing_step_started_at: failingStep.failing_step_started_at ?? null,
      failing_step_completed_at: failingStep.failing_step_completed_at ?? null,
      jobs_count: Array.isArray(failingStep.jobs) ? failingStep.jobs.length : 0
    });

    var jobId = toInt(failingStep.job_id);
    var stepName = String(failingStep.failing_step_name ?? "").trim();
    var stepStartedAt = String(failingStep.failing_step_started_at ?? "").trim();
    var stepCompletedAt = String(failingStep.failing_step_completed_at ?? "").trim();

    if (jobId <= 0 || !stepName) {
      debug("failing-step.empty", {
        run_id: runId,
        repo: repo,
        job_id: jobId,
        step_name: stepName
      });
      context.setBody(JSON.stringify({
        status: "ok",
        run_id: runId,
        repo: repo,
        failing_step: failingStep,
        note: "No failing step was identified for this run"
      }));
      return;
    }

    context.setBody(JSON.stringify({
      status: "ok",
      run_id: runId,
      repo: repo,
      failing_step: {
        job_id: jobId,
        job_name: String(failingStep.job_name ?? ""),
        step_name: stepName,
        step_number: failingStep.failing_step_number ?? null,
        step_started_at: stepStartedAt ?? null,
        step_completed_at: stepCompletedAt ?? null
      },
      log_extraction: {
        disabled: true,
        reason: "redirected external log URLs are not retrieved"
      }
    }));
  });
