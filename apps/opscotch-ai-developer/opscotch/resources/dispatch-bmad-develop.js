doc
  .description("Orchestrate split develop dispatch flow")
  .asUserErrors()
  .inSchema({
    type: "object",
    properties: {
      repo: { type: "string", description: "Repository in owner/repo format" },
      issue: { type: "number", description: "Issue number" }
    }
  })
  .outSchema({
    type: "object",
    properties: {
      status: { type: "string", enum: ["ok", "error"], description: "Dispatch status" }
    }
  })
  .run(() => {

    // Parse body and data
    var payloadText = context.getBody();
    var payload = JSON.parse(payloadText);
    var data = {};
    try {
      var dataRaw = context.getData();
      data = JSON.parse(dataRaw || "{}");
      if (!data || typeof data !== "object") data = {};
    } catch (e) {
      data = {};
    }

    // Helper: parse step response
    function parseStepBody(stepName, response, allowError) {
      if (response.isErrored()) {
        var errMessage = stepName + " step errored";
        try {
          var errors = response.getAllErrors() ?? [];
          var first = String(response.getFirstError(errors) ?? "");
          if (first) errMessage = first;
          else if (errors.length > 0) {
            errMessage = String(errors[0] ?? errMessage);
          }
        } catch (e) { /* use generic step error */ }
        throw new Error(errMessage);
      }
      var raw = response?.getBody() ?? "";
      var parsed = JSON.parse(raw ?? "null");
      if (!parsed || typeof parsed !== "object") {
        throw new Error(stepName + " returned non-object response");
      }
      if (!allowError && (parsed.status ?? "").toLowerCase() === "error") {
        throw new Error(stepName + " returned error: " + JSON.stringify(parsed));
      }
      return { raw: raw, parsed: parsed };
    }

    // Helper: post failure comment
    function postFailureComment(errorMsg) {
      try {
        if (!payload.repo || !payload.issue) return;
        context.sendToStep(
          data.issueUpdaterDeploymentAccessId,
          data.issueUpdaterStepId,
          JSON.stringify({
            operation: "add-comment",
            repo: payload.repo,
            issue: payload.issue,
            comment: "Development dispatch failed before completion.\n\n- status: failed\n- error_message: " + (errorMsg ?? "unknown error") + "\n\n<!-- OPSCOTCH_AI_DEVELOPER_OPERATIONAL -->"
          })
        );
      } catch (e) { /* ignore */ }
    }

    function normStr(value) {
      return String(value ?? "");
    }

    function labelNames(issueContext) {
      var labels = issueContext && Array.isArray(issueContext.labels) ? issueContext.labels : [];
      var out = [];
      for (var i = 0; i < labels.length; i += 1) {
        var name = normStr(labels[i]?.name ?? labels[i]).trim();
        if (name) out.push(name);
      }
      return out;
    }

    function buildCannotStartLabels(issueContext, matched) {
      var labels = labelNames(issueContext);
      var matchedLabel = normStr(matched).trim();
      var matchedLower = matchedLabel.toLowerCase();
      var seen = {};
      var out = [];
      labels.forEach(function(label) {
        var lower = label.toLowerCase();
        if (lower === "in progress" || lower === matchedLower) return;
        if (!seen[lower]) {
          seen[lower] = true;
          out.push(label);
        }
      });
      return out;
    }

    function classifyCannotStart(message) {
      var text = normStr(message);
      if (text.indexOf("is required for sidecar repository") >= 0) return "missing_repository_branch";
      if (text.indexOf("base_branch is required") >= 0) return "missing_base_branch";
      if (text.indexOf("work_branch") >= 0 && text.indexOf("required") >= 0) return "missing_work_branch";
      if (text.indexOf("instructions are required") >= 0) return "missing_instructions";
      return "develop_dispatch_not_started";
    }

    function logDiagnostic(message, details) {
      var line = message + (details ? ": " + JSON.stringify(details) : "");
      context.diagnosticLog(line);
    }

    function callRecoverUpdater(opName, bodyObj) {
      var result = context.sendToStep(
        data.issueUpdaterDeploymentAccessId,
        data.issueUpdaterStepId,
        JSON.stringify(bodyObj)
      );
      if (result.isErrored()) {
        throw new Error("updater " + opName + " step errored");
      }
      var body = JSON.parse(result?.getBody() ?? "{}");
      if ((body.status ?? "").toLowerCase() !== "ok") {
        throw new Error("updater " + opName + " failed: " + JSON.stringify(body));
      }
      return body;
    }

    function recoverCannotStart(errorMsg) {
      var message = normStr(errorMsg || "unknown error");
      var code = classifyCannotStart(message);
      var queue = payload?._queue ?? {};
      var idempotencyKey = normStr(queue?.idempotency_key).trim();
      var runId = normStr(queue?.run_id).trim();
      var updaterError = null;
      function runUpdater(opName, fn) {
        try {
          fn();
        } catch (e) {
          logDiagnostic("develop-recover updater failed", {
            op: opName,
            repo: payload.repo,
            issue: payload.issue,
            error: String(e?.message ?? e)
          });
          if (!updaterError) updaterError = e;
        }
      }
      if (payload.repo && payload.issue) {
        runUpdater("add-comment", function() {
          callRecoverUpdater("add-comment", {
            operation: "add-comment",
            repo: payload.repo,
            issue: payload.issue,
            comment: "Development dispatch was not started.\n\n" +
              "- status: failed\n" +
              "- error_code: " + code + "\n" +
              "- error_message: " + message +
              (code === "missing_repository_branch" ? "\n\nAdd the missing branch to the issue, for example:\n\n`community_branch=main`" : "") +
              "\n\n<!-- OPSCOTCH_AI_DEVELOPER_OPERATIONAL -->"
          });
        });
        runUpdater("consume-ai-action-trigger", function() {
          var consumeResponse = context.sendToStep("consume-ai-action-trigger", JSON.stringify({
            repo: payload.repo,
            issue: payload.issue,
            matched_label: payload.matched_label,
            issue_context: payload.issue_context,
            updater_deployment_access_id: data.issueUpdaterDeploymentAccessId,
            updater_step_id: data.issueUpdaterStepId,
            outcome_label: payload.matched_label,
            return_assignee: normStr(payload?.issue_context?.user?.login).trim()
          }));
          parseStepBody("consume-ai-action-trigger", consumeResponse);
        });
      }
      if (payload.repo && payload.issue && idempotencyKey) {
        context.sendToStepAndForget("track-bmad-develop-status", JSON.stringify({
          operation: "update",
          repo: payload.repo,
          issue: payload.issue,
          idempotency_key: idempotencyKey,
          run_id: runId,
          status: "failed",
          retryable: true,
          error: "true",
          error_code: code,
          error_message: message,
          completed_at: new Date(context.getTimestamp()).toISOString()
        }));
      }
      context.setBody(JSON.stringify({
        status: "error",
        queued: false,
        operation: "develop",
        repo: payload.repo,
        issue: payload.issue,
        error: { code: code, message: message, retryable: true }
      }));
      context.sendToStepAndForget("emit-ai-developer-metric", JSON.stringify({
        operation: "develop",
        stage: "dispatch",
        outcome: "failure",
        value: 1.0,
        metadata: { error: "true", repo: payload.repo, issue_or_pr: payload.issue, error_code: code, error_message: message, retryable: true }
      }));
      if (updaterError) throw updaterError;
    }

    try {
      // Step 1: prepare
      var prepared = parseStepBody(
        "dispatch-bmad-develop-prepare",
        context.sendToStep("dispatch-bmad-develop-prepare", payloadText)
      );

      // Invoke first so a rate-limited sidecar request does not leave a
      // misleading started comment behind.
      var invokeResult = parseStepBody(
        "dispatch-bmad-develop-invoke",
        context.sendToStep("dispatch-bmad-develop-invoke", prepared.raw),
        true
      );

      // Check for error status
      if ((invokeResult.parsed.status ?? "").toLowerCase() === "error") {
        // Map result
        var mapped = parseStepBody(
          "map-bmad-develop-result",
          context.sendToStep("map-bmad-develop-result", JSON.stringify({
            repo: prepared.parsed.repo,
            issue: prepared.parsed.issue,
            run_id: prepared.parsed.run_id ?? "",
            idempotency_key: prepared.parsed.queue_idempotency_key ?? (prepared.parsed.idempotency_key + ":develop"),
            started_at: prepared.parsed.started_at,
            response: invokeResult.parsed
          })),
          true
        );

        // Finalize
        var finalizePayload = JSON.parse(prepared.raw);
        finalizePayload.invoke_response = invokeResult.parsed;
        finalizePayload.mapped = mapped.parsed;
        var finalized = parseStepBody(
          "dispatch-bmad-develop-finalize",
          context.sendToStep("dispatch-bmad-develop-finalize", JSON.stringify(finalizePayload)),
          true
        );
        context.setBody(finalized.raw);
        return;
      }

      // Only announce the task after the sidecar has accepted it. The
      // operational comment is intentionally retained as history.
      parseStepBody(
        "dispatch-bmad-develop-start-comment",
        context.sendToStep("dispatch-bmad-develop-start-comment", prepared.raw)
      );

      // Success path
      context.setBody(invokeResult.raw);
    } catch (err) {
      recoverCannotStart(String(err?.message ?? err));
    }
  });
