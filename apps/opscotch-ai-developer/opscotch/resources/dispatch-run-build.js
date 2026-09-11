doc
  .description("Dispatch GitHub builder multistage-build workflow for matching PR labels")
  .asUserErrors()
  .inSchema({
    type: "object",
    required: ["repo", "pull_number"],
    additionalProperties: true,
    properties: {
      repo: { type: "string", description: "Repository in owner/repo format" },
      pull_number: { type: "number", description: "PR number" },
      matched_label: { type: "string", description: "Matched label" },
      work_branch: { type: "string", description: "Work branch" },
      comments: { type: "array", description: "PR comments" },
      pr_comments: { type: "array", description: "PR review comments" },
      issue_context: { type: "object", description: "Issue context" },
      updated_at: { type: "string", description: "Update timestamp" }
    }
  })
  .dataSchema({
    type: "object",
    required: ["issueUpdaterDeploymentAccessId", "issueUpdaterStepId"],
    additionalProperties: true,
    properties: {
      issueUpdaterDeploymentAccessId: { type: "string", minLength: 1, description: "Deployment access id for updates" },
      issueUpdaterStepId: { type: "string", minLength: 1, description: "Step ID for updates" }
    }
  })
  .outSchema({
    type: "object",
    properties: {
      status: { type: "string", enum: ["ok", "error"], description: "Operation status" },
      queued: { type: "boolean", description: "Whether dispatch was queued" }
    }
  })
  .run(() => {

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

    // Parse body and data - schema validates these
    var payload = JSON.parse(context.getBody());
    var data = JSON.parse(context.getData());

    // Helpers using nullish coalescing
    function normStr(value) {
      return String(value ?? "");
    }

    // Extract field from text
    function extractField(text, key) {
      var regex = new RegExp("(?:^|\\n)\\s*" + key + "\\s*[:=]\\s*([^\\s`]+)", "i");
      var match = regex.exec(normStr(text));
      return match?.[1]?.trim() ?? "";
    }

    // Extract from comments
    function extractFromComments(comments, key) {
      var list = comments ?? [];
      for (var i = list.length - 1; i >= 0; i--) {
        var value = extractField(list[i]?.body, key);
        if (value) return value;
      }
      return "";
    }

    function logDiagnostic(message, details) {
      var line = message + (details ? ": " + JSON.stringify(details) : "");
      context.diagnosticLog(line);
    }

    function callUpdaterStrict(payload, opName) {
      var result = context.sendToStep(data.issueUpdaterDeploymentAccessId, data.issueUpdaterStepId, JSON.stringify(payload));
      var body = parseStepBodyStrict(result, data.issueUpdaterStepId);
      if ((body.status ?? "").toLowerCase() !== "ok") {
        throw new Error("updater " + opName + " failed: " + JSON.stringify(body));
      }
      return body;
    }

    // Add PR comment (soft-fail with diagnostics)
    function addComment(repo, prNum, comment) {
      try {
        callUpdaterStrict({ operation: "add-comment", repo: repo, issue: prNum, comment: comment }, "add-comment");
      } catch (e) {
        logDiagnostic("dispatch-run-build add-comment failed", { repo: repo, pull_number: prNum, error: String(e?.message ?? e) });
      }
    }

    function diagnosticJson(value, maxLength) {
      var text = "";
      try {
        text = JSON.stringify(value ?? {});
      } catch (e) {
        text = String(value ?? "");
      }
      var limit = maxLength ?? 6000;
      return text.length > limit ? text.slice(0, limit) + "..." : text;
    }

    function buildVersionFromBranch(branch) {
      var version = String(branch || "")
        .replace(/[^A-Za-z0-9._-]+/g, "-")
        .replace(/^[^A-Za-z0-9]+/, "")
        .slice(0, 128);
      if (!version) throw new Error("source branch cannot be converted to a build version");
      return version;
    }

    function actionRunnerStepError(response, sourceStepId) {
      var detail = { step_id: sourceStepId };
      try {
        var body = response.getBody();
        if (body) {
          try { detail.body = JSON.parse(body); } catch (e) { detail.body = String(body); }
        }
      } catch (e) { /* preserve the remaining diagnostics */ }
      try {
        detail.errors = response.getAllErrors() || [];
      } catch (e) {
        detail.errors = [];
      }
      try {
        var first = response.getFirstError(detail.errors);
        if (first) detail.first_error = String(first);
      } catch (e) { /* preserve the collected diagnostics */ }
      return detail;
    }

    function buildRunResolutionFailureComment(dispatchResult, triggerPayload, sourceBranch, testrunnerBranch) {
      return "Builder workflow dispatch failed before a run could be tracked.\n\n" +
        "- status: failed\n" +
        "- error_code: run_resolution_failed\n" +
        "- error_message: could not resolve builder workflow run_id after dispatch\n" +
        "- builder_repo: " + triggerPayload.repo + "\n" +
        "- workflow_id: " + triggerPayload.workflow_id + "\n" +
        "- ref: " + triggerPayload.ref + "\n" +
        "- source_branch: " + sourceBranch + "\n" +
        "- testrunnerbranch: " + testrunnerBranch + "\n\n" +
        "Action-runner response:\n```json\n" + diagnosticJson(dispatchResult) + "\n```\n\n" +
        "Dispatch parameters:\n```json\n" + diagnosticJson({
          repo: triggerPayload.repo,
          workflow_id: triggerPayload.workflow_id,
          ref: triggerPayload.ref,
          inputs: triggerPayload.inputs
        }) + "\n```";
    }

    function recoverBuildCannotStart(repo, prNum, issueContext, statusEvent, responseBody) {
      setPrReviewLabel(repo, prNum, issueContext);
      if (statusEvent) emitBuildStatus(statusEvent);
      emitBuildMetric("failure", statusEvent || {
        repo: repo,
        pull_number: prNum,
        error: "true",
        error_code: responseBody && responseBody.error ? responseBody.error.code : "build_cannot_start",
        retryable: responseBody && responseBody.error ? responseBody.error.retryable : true
      });
      context.setBody(JSON.stringify(responseBody));
    }

    function emitBuildStatus(event) {
      try {
        context.sendToStepAndForget("track-run-build-status", JSON.stringify(event));
      } catch (e) {
        logDiagnostic("dispatch-run-build track-status failed", { error: String(e?.message ?? e) });
      }
    }

    function emitBuildMetric(outcome, event) {
      var metadata = { repo: event?.repo, issue_or_pr: event?.pull_number, run_id: event?.run_id, idempotency_key: event?.idempotency_key, error_code: event?.error_code, error_message: event?.error_message, retryable: event?.retryable };
      var failure = outcome === "failure" || metadata.error_code || metadata.error_message;
      context.sendToStepAndForget("emit-ai-developer-metric", JSON.stringify({
        operation: "build_tracking",
        stage: "dispatch",
        outcome: outcome,
        value: 1.0,
        metadata: failure ? Object.assign({}, metadata, { error: "true" }) : metadata
      }));
    }

    function toLabelList(issueContext) {
      var labels = issueContext && Array.isArray(issueContext.labels) ? issueContext.labels : [];
      var out = [];
      for (var i = 0; i < labels.length; i += 1) out.push(normStr(labels[i]?.name ?? labels[i]).trim());
      out = out.filter(function(x) { return !!x; });
      return out;
    }

    // Set PR review label
    function setPrReviewLabel(repo, prNum, issueContext) {
      var result = context.sendToStep("consume-ai-action-trigger", JSON.stringify({
        repo: repo,
        issue: prNum,
        matched_label: "run build",
        issue_context: issueContext,
        updater_deployment_access_id: data.issueUpdaterDeploymentAccessId,
        updater_step_id: data.issueUpdaterStepId,
        outcome_label: "pr review"
      }));
      parseStepBodyStrict(result, "consume-ai-action-trigger");
    }

    function setInProgressLabel(repo, prNum, issueContext, matched) {
      var labelResp = context.sendToStep("compute-pr-labels", JSON.stringify({
        operation: "to-in-progress",
        matched_label: matched,
        labels: toLabelList(issueContext)
      }));
      var labelBody = parseStepBodyStrict(labelResp, "compute-pr-labels");
      if ((labelBody.status ?? "").toLowerCase() !== "ok" || !Array.isArray(labelBody.labels)) {
        throw new Error("compute-pr-labels returned invalid response");
      }
      callUpdaterStrict({ operation: "update-issue", repo: repo, issue: prNum, labels: labelBody.labels }, "update-issue");
    }

    // Get timestamps
    function parseTimestamp(value) {
      var ts = Date.parse(normStr(value));
      return isNaN(ts) ? 0 : ts;
    }

    // Dedupe state
    function loadDedupeState() {
      var raw = context.getPersistedItem("run-build-dispatch-state");
      var state = JSON.parse(raw ?? "{}");
      return state?.seen ?? {};
    }

    // Prune old entries
    function saveDedupeState(seen, nowMs) {
      var maxAge = 24 * 60 * 60 * 1000;
      var pruned = {};
      Object.keys(seen).forEach(function(key) {
        var ts = parseInt(seen[key], 10);
        if (ts > 0 && (nowMs - ts) <= maxAge) pruned[key] = ts;
      });
      context.setPersistedItem("run-build-dispatch-state", JSON.stringify({ seen: pruned }));
    }

    function appBuildFailureComment(dispatchResult, triggerPayload, appBuild) {
      return "App build dispatch failed before a run could be tracked.\n\n" +
        "- status: failed\n" +
        "- error_code: run_resolution_failed\n" +
        "- error_message: could not resolve builder workflow run_id after dispatch\n" +
        "- builder_repo: " + triggerPayload.repo + "\n" +
        "- workflow_id: " + triggerPayload.workflow_id + "\n" +
        "- ref: " + triggerPayload.ref + "\n" +
        "- app: " + appBuild.app + "\n" +
        "- version: " + appBuild.version + "\n" +
        "- visibility: " + appBuild.visibility + "\n" +
        "- release_tag: " + appBuild.releaseTag + "\n\n" +
        "Action-runner response:\n```json\n" + diagnosticJson(dispatchResult) + "\n```\n\n" +
        "Dispatch parameters:\n```json\n" + diagnosticJson({
          repo: triggerPayload.repo,
          workflow_id: triggerPayload.workflow_id,
          ref: triggerPayload.ref,
          inputs: triggerPayload.inputs
        }) + "\n```";
    }

    function dispatchAppSourceBuild(prResult, repo, pullNumber, payload) {
      var app = extractField(prResult.body, "app") || extractFromComments(payload.comments, "app") || extractFromComments(payload.pr_comments, "app");
      var version = extractField(prResult.body, "version") || extractFromComments(payload.comments, "version") || extractFromComments(payload.pr_comments, "version");
      var visibility = (extractField(prResult.body, "visibility") || extractFromComments(payload.comments, "visibility") || extractFromComments(payload.pr_comments, "visibility")).toLowerCase();
      var appNameValid = /^[a-z0-9][a-z0-9._-]*$/i.test(app);
      var versionValid = /^[0-9][0-9A-Za-z._-]*$/.test(version);
      var visibilityValid = visibility === "public" || visibility === "private";
      var appBuild = { app: app, version: version, visibility: visibility, releaseTag: app + "-" + version };

      if (!app || !version || !visibility || !appNameValid || !versionValid || !visibilityValid) {
        var validationMessage = "App build dispatch blocked: required directives must be supplied in the PR body/comments.\n\n" +
          "- `app: <packaging-directory-name>`\n" +
          "- `version: <release-version>`\n" +
          "- `visibility: public|private`";
        addComment(repo, pullNumber, validationMessage);
        var validationCode = !app || !appNameValid ? "app_directive_invalid" : (!version || !versionValid ? "version_directive_invalid" : "visibility_directive_invalid");
        recoverBuildCannotStart(repo, pullNumber, payload.issue_context, {
          operation: "update", idempotency_key: [repo, pullNumber, "run-build", "app-source"].join("|"), repo: repo, pull_number: pullNumber,
          status: "failed", error: "true", error_code: validationCode, error_message: "app, version, and visibility directives are required for app-source builds"
        }, {
          status: "error", queued: false, operation: "run-build", repo: repo, pull_number: pullNumber,
          error: { code: validationCode, message: "app, version, and visibility directives are required for app-source builds", retryable: true }
        });
        return;
      }

      var issueUpdatedAt = payload.issue_context?.updated_at ?? payload.updated_at ?? "";
      var dedupeMarker = [repo, pullNumber, (payload.matched_label ?? "run build").toLowerCase(), issueUpdatedAt || "unknown-updated-at", app, version, visibility, appBuild.releaseTag].join("|");
      var nowMs = context.getTimestamp();
      var seen = loadDedupeState();
      if (seen[dedupeMarker]) {
        context.setBody(JSON.stringify({ status: "ok", queued: false, deduped: true, reason: "duplicate-run-build-dispatch", repo: repo, pull_number: pullNumber, dedupe_marker: dedupeMarker }));
        return;
      }

      var triggerPayload = {
        repo: "opscotch/builder",
        workflow_id: visibility === "public" ? "app-release.yml" : "private-oapp-release.yml",
        ref: "main",
        inputs: { release_tag: appBuild.releaseTag, isLatest: false, isPreRelease: true }
      };
      var resolveResponse = context.sendToStep(
        data.githubActionRunnerDeploymentAccessId || "github-action-runner-callers",
        data.githubActionTriggerStepId || "github-action-trigger",
        JSON.stringify({ operation: "trigger-and-resolve-workflow-run", repo: triggerPayload.repo, workflow_id: triggerPayload.workflow_id,
          ref: triggerPayload.ref, branch: "main", event: "workflow_dispatch", per_page: 20, max_polls: 15, inputs: triggerPayload.inputs })
      );
      var dispatchResult = {};
      var dispatchBody = resolveResponse?.getBody() ?? "";
      if (dispatchBody !== "") {
        try { dispatchResult = JSON.parse(dispatchBody); } catch (e) { dispatchResult = { status: "error", response: String(dispatchBody) }; }
      }
      var actionRunnerErrored = false;
      try { actionRunnerErrored = resolveResponse.isErrored(); } catch (e) { /* response implementations may not expose error state */ }
      if (actionRunnerErrored && Object.keys(dispatchResult).length === 0) {
        dispatchResult = { status: "error", operation: "trigger-and-resolve-workflow-run", error: { code: "action_runner_step_failed", message: "The GitHub action-runner step failed before returning a response." } };
      }
      var runId = parseInt(dispatchResult.run_id, 10);
      var runUrl = dispatchResult.html_url ?? "";
      if (isNaN(runId) || runId <= 0) {
        addComment(repo, pullNumber, appBuildFailureComment(dispatchResult, triggerPayload, appBuild));
        recoverBuildCannotStart(repo, pullNumber, payload.issue_context, {
          operation: "update", idempotency_key: dedupeMarker, repo: repo, pull_number: pullNumber, status: "failed", error: "true",
          error_code: "run_resolution_failed", error_message: "could not resolve builder workflow run_id after dispatch"
        }, {
          status: "error", queued: false, operation: "run-build", repo: repo, pull_number: pullNumber, app: app, version: version, visibility: visibility,
          release_tag: appBuild.releaseTag, error: { code: "run_resolution_failed", message: "could not resolve builder workflow run_id after dispatch", retryable: true }
        });
        return;
      }

      seen[dedupeMarker] = nowMs;
      saveDedupeState(seen, nowMs);
      setInProgressLabel(repo, pullNumber, payload.issue_context, payload.matched_label);
      emitBuildStatus({ operation: "update", idempotency_key: dedupeMarker, repo: repo, pull_number: pullNumber, run_id: runId, status: "queued", app: app, version: version, visibility: visibility, release_tag: appBuild.releaseTag, workflow_id: triggerPayload.workflow_id });
      emitBuildMetric("accepted", { idempotency_key: dedupeMarker, repo: repo, pull_number: pullNumber, run_id: runId });
      context.sendToStepAndForget("process-run-build-tracking-queue", JSON.stringify({
        idempotency_key: dedupeMarker, repo: repo, pull_number: pullNumber, builder_repo: triggerPayload.repo, workflow_id: triggerPayload.workflow_id,
        app: app, version: version, visibility: visibility, release_tag: appBuild.releaseTag, run_id: runId, run_url: runUrl,
        issue_context: payload.issue_context ?? {}, started_at_ts: context.getTimestamp()
      }));
      addComment(repo, pullNumber, "App builder run triggered.\n\n- status: queued\n- workflow: " + triggerPayload.workflow_id + "\n- app: " + app + "\n- version: " + version + "\n- visibility: " + visibility + "\n- release_tag: " + appBuild.releaseTag + "\n- run_id: " + runId + "\n- run_url: " + runUrl);
      context.setBody(JSON.stringify({ status: "ok", queued: true, operation: "run-build", repo: repo, pull_number: pullNumber, app: app, version: version, visibility: visibility, release_tag: appBuild.releaseTag, workflow_id: triggerPayload.workflow_id, run_id: runId, run_url: runUrl, builder_dispatch: dispatchResult, builder_run_resolution: dispatchResult }));
    }

    // Get step IDs
    var updaterDeploymentAccessId = data.issueUpdaterDeploymentAccessId ?? "github-issue-updater-callers-pr";
    var updaterStepId = data.issueUpdaterStepId;

    // Parse PR number
    var pullNumber = parseInt(payload.pull_number, 10);
    if (isNaN(pullNumber) || pullNumber <= 0) throw new Error("pull_number must be a positive integer");

    // Parse repo
    var repo = normStr(payload.repo).trim();
    if (!repo || !repo.includes("/")) throw new Error("repo must be in owner/repo format");

    // Get PR details
    var prResp = context.sendToStep("github-pr-get-details", JSON.stringify({ repo: repo, pull_number: pullNumber }));
    var prResult = JSON.parse(prResp?.getBody() ?? "{}");
    if (repo === "opscotch/opscotch-apps-source") {
      dispatchAppSourceBuild(prResult, repo, pullNumber, payload);
      return;
    }
    var sourceBranch = prResult.head_branch ?? payload.work_branch ?? "";
    if (!sourceBranch) {
      failComment(repo, pullNumber, "unable to resolve PR source branch");
      recoverBuildCannotStart(repo, pullNumber, payload.issue_context, {
          operation: "update",
          idempotency_key: [repo, pullNumber, "run-build"].join("|"),
          repo: repo,
          pull_number: pullNumber,
          status: "failed",
          error: "true",
          error_code: "source_branch_missing",
          error_message: "unable to resolve PR source branch"
        }, {
        status: "error",
        queued: false,
        operation: "run-build",
        repo: repo,
        pull_number: pullNumber,
        error: {
          code: "source_branch_missing",
          message: "unable to resolve PR source branch",
          retryable: true
        }
      });
      return;
    }

    // Extract testrunnerbranch
    var testrunnerBranch = extractField(prResult.body, "testrunnerbranch") || extractFromComments(payload.comments, "testrunnerbranch") || extractFromComments(payload.pr_comments, "testrunnerbranch");
    if (!testrunnerBranch) {
      addComment(repo, pullNumber, "Build dispatch blocked: missing required `testrunnerbranch` in PR body/comments.\n\nPlease add one of:\n- `testrunnerbranch: <branch>`\n- `testrunnerbranch=<branch>`");
      recoverBuildCannotStart(repo, pullNumber, payload.issue_context, {
          operation: "update",
          idempotency_key: [repo, pullNumber, "run-build", sourceBranch].join("|"),
          repo: repo,
          pull_number: pullNumber,
          status: "failed",
          error: "true",
          error_code: "testrunner_branch_missing",
          error_message: "testrunnerbranch is required in PR body/comments"
        }, {
        status: "error",
        queued: false,
        operation: "run-build",
        repo: repo,
        pull_number: pullNumber,
        source_branch: sourceBranch,
        error: {
          code: "testrunner_branch_missing",
          message: "testrunnerbranch is required in PR body/comments",
          retryable: true
        }
      });
      return;
    }

    // Build dedupe marker
    var issueUpdatedAt = payload.issue_context?.updated_at ?? payload.updated_at ?? "";
    var dedupeMarker = [repo, pullNumber, (payload.matched_label ?? "run build").toLowerCase(), issueUpdatedAt || "unknown-updated-at", sourceBranch, testrunnerBranch].join("|");
    var nowMs = context.getTimestamp();
    var seen = loadDedupeState();

    // Check dedupe
    if (seen[dedupeMarker]) {
      context.setBody(JSON.stringify({ status: "ok", queued: false, deduped: true, reason: "duplicate-run-build-dispatch", repo: repo, pull_number: pullNumber, dedupe_marker: dedupeMarker }));
      return;
    }

    // Keep the source ref intact for checkout, but use a path/tag-safe version
    // for release assets, Docker tags, and artifact filenames.
    var buildVersion = buildVersionFromBranch(sourceBranch);

    // Build trigger payload
    var triggerPayload = {
      operation: "trigger-workflow",
      repo: "opscotch/builder",
      workflow_id: "multistage-build.yml",
      ref: "main",
      inputs: {
        branch: sourceBranch,
        version: buildVersion,
        betarelease: true,
        prerelease: true,
        builddevtools: true,
        builddevagent: true,
        prodbuild: true,
        testrunnerbranch: testrunnerBranch,
        runner: "self-hosted"
      }
    };

    // Trigger builder
    // Trigger + resolve workflow run via action runner.
    var resolveResponse = context.sendToStep(
      data.githubActionRunnerDeploymentAccessId || "github-action-runner-callers",
      data.githubActionTriggerStepId || "github-action-trigger",
      JSON.stringify({
      operation: "trigger-and-resolve-workflow-run",
      repo: "opscotch/builder",
      workflow_id: "multistage-build.yml",
      ref: "main",
      branch: "main",
      event: "workflow_dispatch",
      per_page: 20,
      max_polls: 15,
      inputs: triggerPayload.inputs
    }));
    var dispatchResult = {};
    var dispatchBody = resolveResponse?.getBody() ?? "";
    if (dispatchBody !== "") {
      try {
        dispatchResult = JSON.parse(dispatchBody);
      } catch (e) {
        dispatchResult = { status: "error", response: String(dispatchBody) };
      }
    }
    var actionRunnerErrored = false;
    try {
      actionRunnerErrored = resolveResponse.isErrored();
    } catch (e) { /* response implementations may not expose error state */ }
    if (actionRunnerErrored && Object.keys(dispatchResult).length === 0) {
      dispatchResult = {
        status: "error",
        operation: "trigger-and-resolve-workflow-run",
        error: {
          code: "action_runner_step_failed",
          message: "The GitHub action-runner step failed before returning a response."
        },
        action_runner_step_error: actionRunnerStepError(
          resolveResponse,
          data.githubActionTriggerStepId || "github-action-trigger"
        )
      };
    }
    var runId = parseInt(dispatchResult.run_id, 10);
    var runUrl = dispatchResult.html_url ?? "";
    if (isNaN(runId) || runId <= 0) {
      addComment(repo, pullNumber, buildRunResolutionFailureComment(
        dispatchResult,
        triggerPayload,
        sourceBranch,
        testrunnerBranch
      ));
      recoverBuildCannotStart(repo, pullNumber, payload.issue_context, {
          operation: "update",
          idempotency_key: dedupeMarker,
          repo: repo,
          pull_number: pullNumber,
          status: "failed",
          error: "true",
          error_code: "run_resolution_failed",
          error_message: "could not resolve builder workflow run_id after dispatch"
        }, {
        status: "error",
        queued: false,
        operation: "run-build",
        repo: repo,
        pull_number: pullNumber,
        source_branch: sourceBranch,
        testrunner_branch: testrunnerBranch,
        error: {
          code: "run_resolution_failed",
          message: "could not resolve builder workflow run_id after dispatch",
          retryable: true
        }
      });
      return;
    }

    // Save dedupe state
    seen[dedupeMarker] = nowMs;
    saveDedupeState(seen, nowMs);
    setInProgressLabel(repo, pullNumber, payload.issue_context, payload.matched_label);
    emitBuildStatus({
      operation: "update",
      idempotency_key: dedupeMarker,
      repo: repo,
      pull_number: pullNumber,
      run_id: runId,
      status: "queued"
    });
    emitBuildMetric("accepted", { idempotency_key: dedupeMarker, repo: repo, pull_number: pullNumber, run_id: runId });

    // Queue tracking
    context.sendToStepAndForget("process-run-build-tracking-queue", JSON.stringify({
      idempotency_key: dedupeMarker,
      repo: repo,
      pull_number: pullNumber,
      builder_repo: "opscotch/builder",
      workflow_id: "multistage-build.yml",
      source_branch: sourceBranch,
      testrunner_branch: testrunnerBranch,
      opscotch_runtime_version: buildVersion,
      run_id: runId,
      run_url: runUrl,
      issue_context: payload.issue_context ?? {},
      started_at_ts: context.getTimestamp()
    }));

    // Success comment
    addComment(repo, pullNumber, "Builder run triggered.\n\n- status: queued\n- workflow: multistage-build.yml\n- run_id: " + runId + "\n- run_url: " + runUrl + "\n- source_branch: " + sourceBranch + "\n- testrunnerbranch: " + testrunnerBranch + "\n- Opscotch runtime version: " + buildVersion);

    context.setBody(JSON.stringify({
      status: "ok",
      queued: true,
      operation: "run-build",
      repo: repo,
      pull_number: pullNumber,
      source_branch: sourceBranch,
      testrunner_branch: testrunnerBranch,
      opscotch_runtime_version: buildVersion,
      run_id: runId,
      run_url: runUrl,
      builder_dispatch: dispatchResult,
      builder_run_resolution: dispatchResult
    }));
  });
