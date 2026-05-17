doc
  .description("Trigger a workflow_dispatch and resolve the newly created run id by polling workflow runs")
  .asUserErrors()
  .outSchema({
    type: "object",
    properties: {
      status: { type: "string", description: "'ok' or error indicator" },
      operation: { type: "string" },
      repo: { type: "string", description: "Owner/repo format" },
      workflow_id: { type: "string", description: "File name or ID" },
      run_id: { type: "number" },
      run_number: { type: "number" },
      run_status: { type: "string", enum: ["queued", "in_progress", "completed"] },
      run_conclusion: { type: ["string", "null"], description: "Run conclusion when completed; null while not completed" },
      created_at: { type: "string", description: "ISO timestamp" },
      updated_at: { type: "string", description: "ISO timestamp" },
      html_url: { type: "string", description: "Link to run in GitHub" },
      trigger_response: { type: "object", description: "GitHub API response" },
      polls_used: { type: "number", description: "Polls to find new run" }
    },
    required: ["status", "operation", "repo", "workflow_id", "polls_used"]
  })
  .inSchema({
    type: "object",
    required: ["repo", "workflow_id", "ref"],
    properties: {
      repo: { type: "string", description: "Owner/repo format" },
      workflow_id: { type: "string", description: "File name or ID" },
      ref: { type: "string", description: "Branch or tag to trigger" },
      branch: { type: "string", description: "Filter runs by branch" },
      event: { type: "string", enum: ["workflow_dispatch", "schedule"] },
      per_page: { type: "number", description: "Number of runs to fetch per page" },
      max_polls: { type: "number", description: "Maximum number of polls to find new run" },
      inputs: { type: "object", description: "Workflow dispatch inputs" }
    }
  })
  .run(() => {
    function normalizePositiveInt(name, value) {
      if (value === undefined || value === null || value === "") throw new Error(name + " is required");
      var n = parseInt(String(value), 10);
      if (isNaN(n) || n <= 0) throw new Error(name + " must be a positive integer");
      return n;
    }

    function toRunIdSet(runs) {
      var set = {};
      for (var i = 0; i < runs.length; i += 1) {
        var id = parseInt(String(runs[i].id), 10);
        if (!isNaN(id) && id > 0) set[id] = true;
      }
      return set;
    }

    function pickNewestNewRun(runs, beforeSet, minCreatedTs) {
      var best = null;
      var bestCreatedTs = 0;
      for (var i = 0; i < runs.length; i += 1) {
        var run = runs[i];
        var id = parseInt(String(run.id), 10);
        if (isNaN(id) || id <= 0) continue;
        if (beforeSet[id]) continue;
        var createdTs = Date.parse(String(run.created_at || ""));
        if (isNaN(createdTs)) createdTs = 0;
        if (minCreatedTs > 0 && createdTs > 0 && createdTs < minCreatedTs) continue;
        if (!best || createdTs > bestCreatedTs) {
          best = run;
          bestCreatedTs = createdTs;
        }
      }
      return best;
    }

    function listRuns(query) {
      var listResponse = context.sendToStep("github-action-list-runs", JSON.stringify({
        operation: "list-workflow-runs",
        repo: query.repo,
        workflow_id: query.workflow_id,
        branch: query.branch,
        event: query.event,
        per_page: query.per_page
      }));
      var listResult = JSON.parse(listResponse.getBody());
      return listResult.runs;
    }

    var input = JSON.parse(context.getBody());
    var repo = input.repo;
    var workflowId = input.workflow_id;
    var ref = input.ref;
    var branch = input.branch || ref;
    var event = input.event || "workflow_dispatch";
    var perPage = normalizePositiveInt("per_page", input.per_page ?? 20);
    var maxPolls = normalizePositiveInt("max_polls", input.max_polls ?? 15);

    if (!repo || repo.indexOf("/") < 0) throw new Error("repo must be in owner/repo format");

    var query = {
      repo: repo,
      workflow_id: workflowId,
      branch: branch,
      event: event,
      per_page: perPage
    };

    var beforeRuns = listRuns(query);
    var beforeSet = toRunIdSet(beforeRuns);
    var dispatchStartTs = context.getTimestamp();

    var triggerResponse = context.sendToStep("github-action-trigger-only", JSON.stringify({
      operation: "trigger-workflow",
      repo: repo,
      workflow_id: workflowId,
      ref: ref,
      inputs: input.inputs && typeof input.inputs === "object" && !Array.isArray(input.inputs) ? input.inputs : undefined
    }));
    var triggerResult = JSON.parse(triggerResponse.getBody());
    console.log(JSON.stringify({
      log: "actions-trigger-and-resolve-run dispatch-response",
      repo: repo,
      workflow_id: workflowId,
      workflow_run_id: triggerResult.workflow_run_id ?? null,
      run_url: triggerResult.run_url ?? null,
      html_url: triggerResult.html_url ?? null,
      status: triggerResult.status ?? null,
      operation: triggerResult.operation ?? null,
      keys: Object.keys(triggerResult)
    }));

    var resolved = null;
    var polls = 0;
    var minCreatedTs = dispatchStartTs - 2 * 60 * 1000;

    for (polls = 1; polls <= maxPolls; polls += 1) {
      var afterRuns = listRuns(query);
      resolved = pickNewestNewRun(afterRuns, beforeSet, minCreatedTs);
      if (resolved) break;
    }

    if (!resolved) {
      throw new Error("workflow dispatched but no new run appeared after " + String(maxPolls) + " polls");
    }

    context.setBody(JSON.stringify({
      status: "ok",
      operation: "trigger-and-resolve-workflow-run",
      repo: repo,
      workflow_id: workflowId,
      run_id: resolved.id,
      run_number: resolved.run_number,
      run_status: resolved.status,
      run_conclusion: resolved.conclusion,
      created_at: resolved.created_at,
      updated_at: resolved.updated_at,
      html_url: resolved.html_url,
      trigger_response: triggerResult,
      polls_used: polls
    }));
  });
