doc
  .description("Track and poll queued GitHub builder workflow runs for PR build status")
  .inSchema({
    oneOf: [
      {
        type: "object",
        additionalProperties: true,
        properties: {
          repo: { type: "string", description: "Repository" },
          pull_number: { type: "number", description: "PR number" },
          run_id: { type: "number", description: "Run ID" },
          workflow_id: { type: "string", description: "Workflow ID" },
          builder_repo: { type: "string", description: "Builder repository" },
          source_branch: { type: "string", description: "Source branch" },
          testrunner_branch: { type: "string", description: "Test runner branch" },
          issue_context: { type: "object", description: "Issue context" },
          started_at_ts: { type: "number", description: "Start timestamp" },
          run_url: { type: "string", description: "Run URL" },
          notification_type: { type: "string", description: "Notification type" },
          run: { type: "object", description: "Run notification data" }
        }
      },
      {
        type: "null",
        description: "Timer trigger sends no body"
      }
    ]
  })
  .dataSchema({
    type: "object",
    properties: {
      issueUpdaterDeploymentAccessId: { type: "string", description: "Deployment access id for updates" },
      issueUpdaterStepId: { type: "string", description: "Step ID for updates" },
      githubActionRunnerDeploymentAccessId: { type: "string", description: "Deployment access id for GitHub Actions lookups" },
      githubActionGetRunStepId: { type: "string", description: "Step ID for workflow run lookup" },
      githubActionGetFailingStepStepId: { type: "string", description: "Step ID for failing-step lookup" },
      githubActionGetFailingStepLogsStepId: { type: "string", description: "Step ID for failing-step log lookup" },
      failingStepLogTailLines: { type: "number", description: "Maximum number of trailing failing-step log lines to include in comments" }
    }
  })
  .outSchema({
    type: "object",
    properties: {
      queued: { type: "boolean", description: "Whether queued" },
      processed: { type: "boolean", description: "Whether processed" },
      completed: { type: "boolean", description: "Whether completed" },
      queue_size: { type: "number", description: "Queue size" }
    }
  })
  .run(() => {

    var QUEUE_KEY = "builder:run-tracking:queue";
    var MAX_AGE_MS = 12 * 60 * 60 * 1000;
    var data = JSON.parse(context.getData() || "{}");
    var updaterDeploymentAccessId = String(data.issueUpdaterDeploymentAccessId ?? "github-issue-updater-callers-pr").trim() || "github-issue-updater-callers-pr";
    var updaterStepId = String(data.issueUpdaterStepId || "github-issue-updater").trim() || "github-issue-updater";
    var actionRunnerDeploymentAccessId = String(data.githubActionRunnerDeploymentAccessId || "github-action-runner-callers").trim() || "github-action-runner-callers";
    var actionGetRunStepId = String(data.githubActionGetRunStepId || "github-action-get-run").trim() || "github-action-get-run";
    var actionGetFailingStepStepId = String(data.githubActionGetFailingStepStepId || "github-action-get-failing-step").trim() || "github-action-get-failing-step";
    var actionGetFailingStepLogsStepId = String(data.githubActionGetFailingStepLogsStepId || "github-action-get-failing-step-logs").trim() || "github-action-get-failing-step-logs";
    var failingStepLogTailLines = parseInt(String(data.failingStepLogTailLines ?? "20"), 10);
    if (isNaN(failingStepLogTailLines) || failingStepLogTailLines <= 0) {
      failingStepLogTailLines = 20;
    }

    function parseStepBodyStrict(response, sourceStepId) {
      if (response.isErrored()) {
        throw new Error(stepErrorMessage(response, sourceStepId));
      }
      var rawBody = response ? response.getBody() : "";
      if (rawBody === null || rawBody === undefined || rawBody === "") {
        return {};
      }
      if (typeof rawBody === "object") {
        throw new Error("Expected string body from " + sourceStepId + " but received object");
      }
      return JSON.parse(String(rawBody));
    }

    function stepErrorMessage(response, sourceStepId) {
      var detail = { step_id: sourceStepId };
      try {
        var bodyText = response.getBody();
        if (bodyText) {
          try { detail.body = JSON.parse(bodyText); } catch (e) { detail.body = bodyText; }
        }
      } catch (e) { /* ignore */ }
      try {
        var allErrors = response.getAllErrors();
        if (allErrors) detail.errors = allErrors;
      } catch (e) { /* ignore */ }
      try {
        var first = response.getFirstError(detail.errors ?? []);
        if (first) detail.first_error = String(first);
      } catch (e) { /* ignore */ }
      return sourceStepId + " step errored: " + JSON.stringify(detail);
    }

    function getQueue() {
      var queue = JSON.parse(context.getPersistedItem(QUEUE_KEY) ?? "[]");
      return Array.isArray(queue) ? queue : [];
    }

    function setQueue(queue) {
      context.setPersistedItem(QUEUE_KEY, JSON.stringify(queue));
    }

    function formatFailureDiagnostics(item, runResult) {
      var diagnostics = [];
      var hasStepIdentity = false;
      var failingStepLogLines = [];
      function debug(event, payload) {
        try {
          console.log("[process-run-build-tracking-queue] " + event + " " + JSON.stringify(payload ?? {}));
        } catch (ignoreDebugLogFailure) {
        }
      }
      try {
        var runLogsUrl = String(runResult.logs_redirect_url ?? runResult.logs_url ?? "").trim();
        if (runLogsUrl) {
          diagnostics.push("- run_logs_url: " + runLogsUrl);
        }
        var runLogsCachePath = String(runResult.logs_cache_path ?? "").trim();
        if (runLogsCachePath) {
          diagnostics.push("- run_logs_cache_file: " + runLogsCachePath);
        }
        var failingStepResponse = context.sendToStep(actionRunnerDeploymentAccessId, actionGetFailingStepStepId, JSON.stringify({
          operation: "get-failing-step",
          repo: item.builder_repo ?? "opscotch/builder",
          run_id: item.run_id
        }));
        var failingStep = JSON.parse(failingStepResponse?.getBody() ?? "{}");
        var jobId = parseInt(String(failingStep.job_id), 10);
        var stepName = String(failingStep.failing_step_name ?? "").trim();
        var stepStartedAt = String(failingStep.failing_step_started_at ?? "").trim();
        var stepCompletedAt = String(failingStep.failing_step_completed_at ?? "").trim();
        debug("failing-step.lookup", {
          run_id: item.run_id,
          repo: item.builder_repo ?? "opscotch/builder",
          job_id: isNaN(jobId) ? null : jobId,
          step_name: stepName ?? null,
          step_started_at: stepStartedAt ?? null,
          step_completed_at: stepCompletedAt ?? null
        });

        if (!isNaN(jobId) && jobId > 0 && stepName) {
          hasStepIdentity = true;
          diagnostics.push("- failing_job_id: " + String(jobId));
          diagnostics.push("- failing_step_name: " + stepName);
        }

        if (!isNaN(jobId) && jobId > 0 && stepName) {
          var failingStepLogsResponse = context.sendToStep(actionRunnerDeploymentAccessId, actionGetFailingStepLogsStepId, JSON.stringify({
            repo: item.builder_repo ?? "opscotch/builder",
            run_id: item.run_id,
            log_fetch_deployment_access_id: "cli-sidecar-pr-actions-build-state",
            log_fetch_step_id: "fetch-run-log-content"
          }));
          var failingStepLogsBody = parseStepBodyStrict(failingStepLogsResponse, actionGetFailingStepLogsStepId);
          failingStepLogLines = Array.isArray(failingStepLogsBody.step_log_lines) ? failingStepLogsBody.step_log_lines : [];
          if (failingStepLogLines.length > 0) {
            diagnostics.push("- failing_step_log_lines: " + String(failingStepLogLines.length));
          }
        }
      } catch (ignoreDiagnosticsFailure) {
      }
      return {
        diagnostics: diagnostics,
        has_step_identity: hasStepIdentity,
        failing_step_log_lines: failingStepLogLines
      };
    }

    function fetchRunCompletionDetails(item, fallbackRunResult) {
      var out = {
        run_id: fallbackRunResult.run_id ?? item.run_id,
        run_conclusion: String(fallbackRunResult.run_conclusion ?? ""),
        html_url: String(fallbackRunResult.html_url ?? item.run_url ?? ""),
        logs_url: String(fallbackRunResult.logs_url ?? ""),
        logs_redirect_url: String(fallbackRunResult.logs_redirect_url ?? ""),
        logs_cache_path: "",
        opscotch_runtime_version: String(fallbackRunResult.opscotch_runtime_version ?? item.opscotch_runtime_version ?? "")
      };

      try {
        var runResponse = context.sendToStep(actionRunnerDeploymentAccessId, actionGetRunStepId, JSON.stringify({
          operation: "get-workflow-run",
          repo: item.builder_repo ?? "opscotch/builder",
          run_id: item.run_id
        }));
        var runBody = parseStepBodyStrict(runResponse, actionGetRunStepId);
        if ((runBody.status ?? "").toLowerCase() === "ok") {
          out.run_id = runBody.run_id ?? out.run_id;
          out.run_conclusion = String(runBody.run_conclusion ?? out.run_conclusion);
          out.html_url = String(runBody.html_url ?? out.html_url);
          out.logs_url = String(runBody.logs_url ?? out.logs_url);
          out.opscotch_runtime_version = String(runBody.opscotch_runtime_version ?? out.opscotch_runtime_version);
        }
      } catch (ignoreRunFetchFailure) {
      }

      if (String(out.run_conclusion).toLowerCase() !== "success") try {
        var fetchedLogsResponse = context.sendToStep("fetch-run-log-content", JSON.stringify({
          repo: item.builder_repo ?? "opscotch/builder",
          run_id: item.run_id
        }));
        var fetchedLogsBody = parseStepBodyStrict(fetchedLogsResponse, "fetch-run-log-content");
        if ((fetchedLogsBody.status ?? "").toLowerCase() === "ok") {
          out.logs_redirect_url = String(fetchedLogsBody.logs_redirect_url ?? out.logs_redirect_url);
          out.logs_cache_path = String(fetchedLogsBody.cache_path ?? out.logs_cache_path);
        }
      } catch (ignoreRunLogsContentFailure) {
      }

      return out;
    }

    function addComment(item, lines) {
      try {
        var result = context.sendToStep(updaterDeploymentAccessId, updaterStepId, JSON.stringify({
          operation: "add-comment",
          repo: item.repo,
          issue: item.pull_number,
          comment: lines.join("\n")
        }));
        var body = parseStepBodyStrict(result, updaterStepId);
        if ((body.status ?? "").toLowerCase() !== "ok") {
          throw new Error("updater add-comment failed: " + JSON.stringify(body));
        }
      } catch (ignoreCommentFailure) {
      }
    }

    function emitBuildStatus(event) {
      try {
        context.sendToStepAndForget("track-run-build-status", JSON.stringify(event));
      } catch (ignoreStatusFailure) {
      }
    }

    function emitBuildMetric(outcome, event) {
      var metadata = { repo: event?.repo, issue_or_pr: event?.pull_number, run_id: event?.run_id, idempotency_key: event?.idempotency_key, error_code: event?.error_code, error_message: event?.error_message, retryable: event?.retryable };
      var failure = outcome === "failure" || metadata.error_code || metadata.error_message;
      context.sendToStepAndForget("emit-ai-developer-metric", JSON.stringify({
        operation: "build_tracking",
        stage: "tracking",
        outcome: outcome,
        value: 1.0,
        metadata: failure ? Object.assign({}, metadata, { error: "true" }) : metadata
      }));
    }

    function toLabelList(labels) {
      var out = [];
      for (var i = 0; i < labels.length; i += 1) out.push(String(labels[i]?.name ?? labels[i] ?? "").trim());
      out = out.filter(function(x) { return !!x; });
      return out;
    }

    function setPrReviewLabel(item) {
      var result = context.sendToStep("consume-ai-action-trigger", JSON.stringify({
        repo: item.repo,
        issue: item.pull_number,
        matched_label: "run build",
        issue_context: { labels: Array.isArray(item.issue_labels) ? item.issue_labels : [] },
        updater_deployment_access_id: updaterDeploymentAccessId,
        updater_step_id: updaterStepId,
        outcome_label: "pr review"
      }));
      var body = parseStepBodyStrict(result, "consume-ai-action-trigger");
      if ((body.status ?? "").toLowerCase() !== "ok") {
        throw new Error("consume-ai-action-trigger failed: " + JSON.stringify(body));
      }
    }

    function completeTrackedItem(item, runResult) {
      function escapeTableCell(text) {
        return String(text).replace(/\|/g, "\\|");
      }

      function renderLogTable(entries, limits) {
        var selected = entries.slice();
        var lineTruncated = false;
        if (selected.length > limits.lines) {
          selected = selected.slice(selected.length - limits.lines);
          lineTruncated = true;
        }

        function buildTableRows(rows) {
          var out = ["| ms_since_step_start | log |", "|---:|---|"];
          for (var i = 0; i < rows.length; i += 1) {
            var row = rows[i];
            var ms = parseInt(String(row.milliseconds_since_first_true_log), 10);
            if (isNaN(ms) || ms < 0) ms = 0;
            out.push("| " + String(ms) + " | " + escapeTableCell(String(row.log ?? "")) + " |");
          }
          return out;
        }

        var charTruncated = false;
        var tableRows = buildTableRows(selected);
        var tableText = tableRows.join("\n");

        while (selected.length > 0 && tableText.length > limits.chars) {
          selected = selected.slice(1);
          charTruncated = true;
          tableRows = buildTableRows(selected);
          tableText = tableRows.join("\n");
        }

        var prefix = "";
        if (lineTruncated) {
          prefix = "[truncated: showing last " + String(limits.lines) + " lines]...\n";
        }
        if (charTruncated) {
          prefix = "[truncated: showing last " + String(limits.chars) + " chars]...\n";
        }

        return prefix + tableText;
      }

      function parseLogsToCollect(value, defaults) {
        var out = { lines: defaults.lines, chars: defaults.chars };
        var text = String(value ?? "").trim();
        if (!text) return out;
        var m = text.match(/^(\d+)\s*:\s*(\d+)$/);
        if (!m) return out;
        var lines = parseInt(m[1], 10);
        var chars = parseInt(m[2], 10);
        if (!isNaN(lines) && lines > 0) out.lines = lines;
        if (!isNaN(chars) && chars > 0) out.chars = chars;
        return out;
      }

      var success = String(runResult.run_conclusion ?? "").toLowerCase() === "success";
      var buildLogMarker = "<!-- CLI_SIDECAR_BUILD_FAILED_STEP_LOG -->";
      var lines = [
        buildLogMarker,
        "Builder run completed.",
        "",
        "- status: " + (success ? "success" : "failed"),
        "- conclusion: " + String(runResult.run_conclusion ?? "unknown"),
        "- run_id: " + String(runResult.run_id ?? item.run_id),
        "- run_url: " + String(runResult.html_url ?? item.run_url ?? ""),
        "- Opscotch runtime version: " + String(runResult.opscotch_runtime_version ?? item.opscotch_runtime_version ?? "unknown")
      ];
      if (!success) {
        var diagnosticsState = formatFailureDiagnostics(item, runResult);
        var diagnostics = diagnosticsState.diagnostics;
        if (diagnostics.length > 0) {
          lines = lines.concat([""]).concat(diagnostics);
        }
        var failingStepLogLines = Array.isArray(diagnosticsState.failing_step_log_lines) ? diagnosticsState.failing_step_log_lines : [];
        if (failingStepLogLines.length > 0) {
          var limits = parseLogsToCollect(item.logs_to_collect, {
            lines: failingStepLogTailLines,
            chars: 5000
          });
          var failingStepLogTable = renderLogTable(failingStepLogLines, limits);
          lines = lines.concat(["", "Failing step logs:", failingStepLogTable]);
        }
      }
      addComment(item, lines);
      setPrReviewLabel(item);
      emitBuildStatus({
        operation: "update",
        idempotency_key: String(item.idempotency_key ?? ""),
        repo: item.repo,
        pull_number: item.pull_number,
        run_id: item.run_id,
        status: success ? "succeeded" : "failed",
        error: success ? undefined : "true",
        error_code: success ? "" : "builder_run_failed",
        error_message: success ? "" : String(runResult.run_conclusion ?? "unknown")
      });
      emitBuildMetric(success ? "success" : "failure", {
        idempotency_key: String(item.idempotency_key ?? ""),
        repo: item.repo,
        pull_number: item.pull_number,
        run_id: item.run_id,
        error: success ? undefined : "true",
        error_code: success ? undefined : "builder_run_failed",
        error_message: success ? undefined : String(runResult.run_conclusion ?? "unknown")
      });
      return {
        success: success
      };
    }

    var incoming = JSON.parse(context.getBody());
    if (incoming && typeof incoming === "object" && incoming.run_id !== undefined && incoming.pull_number !== undefined) {
      var addQueue = getQueue();
      var incomingRunId = parseInt(String(incoming.run_id), 10);
      if (isNaN(incomingRunId) || incomingRunId <= 0) {
        context.setBody(JSON.stringify({ queued: false, reason: "invalid-run-id" }));
        return;
      }
      var duplicate = false;
      for (var i = 0; i < addQueue.length; i += 1) {
        if (parseInt(String(addQueue[i]?.run_id), 10) === incomingRunId) {
          duplicate = true;
          break;
        }
      }
      if (duplicate) {
        context.setBody(JSON.stringify({ queued: true, deduped: true, run_id: incomingRunId, queue_size: addQueue.length }));
        return;
      }
      addQueue.push({
        repo: String(incoming.repo ?? ""),
        pull_number: parseInt(String(incoming.pull_number), 10),
        run_id: incomingRunId,
        idempotency_key: String(incoming.idempotency_key ?? ""),
        workflow_id: String(incoming.workflow_id ?? "multistage-build.yml"),
        builder_repo: String(incoming.builder_repo ?? "opscotch/builder"),
        source_branch: String(incoming.source_branch ?? ""),
        testrunner_branch: String(incoming.testrunner_branch ?? ""),
        opscotch_runtime_version: String(incoming.opscotch_runtime_version ?? incoming.build_version ?? ""),
        issue_labels: incoming.issue_context && Array.isArray(incoming.issue_context.labels) ? incoming.issue_context.labels : [],
        started_at_ts: Number(incoming.started_at_ts ?? context.getTimestamp()),
        run_url: String(incoming.run_url ?? "")
      });
      setQueue(addQueue);
      context.setBody(JSON.stringify({ queued: true, queue_size: addQueue.length }));
      return;
    }

    var queue = getQueue();
    if (incoming && typeof incoming === "object" && incoming.notification_type === "github-action-state-change") {
      var notificationRun = incoming.run && typeof incoming.run === "object" ? incoming.run : {};
      var notificationWatched = incoming.watched && typeof incoming.watched === "object" ? incoming.watched : {};
      var incomingRunId = parseInt(String(notificationRun.id), 10);
      if (isNaN(incomingRunId) || incomingRunId <= 0) {
        context.setBody(JSON.stringify({ processed: false, reason: "invalid-notification-run-id" }));
        return;
      }
      var status = String(notificationRun.status ?? "").toLowerCase();
      if (status !== "completed") {
        context.setBody(JSON.stringify({ processed: false, reason: "notification-not-completed", run_id: incomingRunId }));
        return;
      }

      var matchedIndex = -1;
      for (var q = 0; q < queue.length; q += 1) {
        if (parseInt(String(queue[q]?.run_id), 10) === incomingRunId) {
          matchedIndex = q;
          break;
        }
      }

      if (matchedIndex < 0) {
        context.setBody(JSON.stringify({ processed: false, reason: "run-not-tracked", run_id: incomingRunId, remaining: queue.length }));
        return;
      }

      var trackedItem = queue.splice(matchedIndex, 1)[0];
      var logsToCollect = String(notificationWatched.logsToCollect ?? "").trim();
      if (logsToCollect) {
        trackedItem.logs_to_collect = logsToCollect;
      }
      var completionDetails = fetchRunCompletionDetails(trackedItem, {
        run_id: incomingRunId,
        run_conclusion: String(notificationRun.conclusion ?? ""),
        html_url: String(notificationRun.html_url ?? trackedItem.run_url ?? ""),
        logs_url: String(notificationRun.logs_url ?? "")
      });
      var completionFromNotification = completeTrackedItem(trackedItem, completionDetails);
      setQueue(queue);
      context.setBody(JSON.stringify({
        processed: true,
        completed: true,
        source: "action-state-change",
        success: completionFromNotification.success,
        run_id: incomingRunId,
        remaining: queue.length
      }));
      return;
    }

    if (queue.length === 0) {
      context.setBody(JSON.stringify({ processed: false, reason: "empty-queue" }));
      return;
    }

    var item = queue.shift();
    var now = context.getTimestamp();
    if (!item || !item.run_id || !item.repo || !item.pull_number) {
      setQueue(queue);
      context.setBody(JSON.stringify({ processed: false, reason: "invalid-item", remaining: queue.length }));
      return;
    }

    if (now - Number(item.started_at_ts ?? now) > MAX_AGE_MS) {
      addComment(item, [
        "Builder run tracking expired.",
        "",
        "- status: timeout",
        "- run_id: " + String(item.run_id),
        "- run_url: " + String(item.run_url ?? "")
      ]);
      setPrReviewLabel(item);
      emitBuildStatus({
        operation: "update",
        idempotency_key: String(item.idempotency_key ?? ""),
        repo: item.repo,
        pull_number: item.pull_number,
        run_id: item.run_id,
        status: "failed",
        error: "true",
        error_code: "tracking_timeout",
        error_message: "builder run tracking expired"
      });
      emitBuildMetric("failure", { idempotency_key: String(item.idempotency_key ?? ""), repo: item.repo, pull_number: item.pull_number, run_id: item.run_id, error: "true", error_code: "tracking_timeout", error_message: "builder run tracking expired" });
      setQueue(queue);
      context.setBody(JSON.stringify({ processed: true, completed: true, timeout: true, remaining: queue.length }));
      return;
    }

    // Notification-driven completion:
    // keep active items queued and update heartbeat status until a
    // github-action-state-change(completed) event arrives.
    emitBuildStatus({
      operation: "update",
      idempotency_key: String(item.idempotency_key ?? ""),
      repo: item.repo,
      pull_number: item.pull_number,
      run_id: item.run_id,
      status: "running"
    });
    queue.push(item);
    setQueue(queue);
    context.setBody(JSON.stringify({
      processed: true,
      completed: false,
      waiting_for_notification: true,
      run_id: item.run_id,
      remaining: queue.length
    }));
  });
