doc
  .description("Route issue events to configured deployment/step targets")
  .asUserErrors()
  .inSchema({
    type: "object",
    required: [
      "repo",
      "issue_number",
      "entity_type",
      "labels",
      "matched_label",
      "action_deployment_id",
      "action_step_id",
      "updated_at",
      "title",
      "issue_body",
      "issue_context"
    ],
    additionalProperties: true,
    properties: {
      entity_type: { type: "string" },
      repo: { type: "string" },
      issue_number: { oneOf: [{ type: "number" }, { type: "string" }] },
      issue_url: { type: "string" },
      title: { type: "string" },
      issue_body: { type: "string" },
      issue_context: { type: "object" },
      labels: { type: "array", items: { type: "string" } },
      matched_label: { type: "string" },
      action_deployment_id: { type: "string" },
      action_step_id: { type: "string" },
      updated_at: { type: "string" }
    }
  })
  .dataSchema({
    type: "object",
    required: ["issueWatcherDecisionLoggingEnabled"],
    additionalProperties: true,
    properties: {
      issueWatcherDecisionLoggingEnabled: { type: "boolean" }
    }
  })
  .run(() => {
    function parseJson(value, fallback, sourceStepId) {
      if (value === null || value === undefined || value === "") {
        return fallback;
      }
      if (typeof value === "object") {
        throw new Error("Expected string body from " + sourceStepId + " but received object");
      }

      var raw = String(value).trim();
      if (raw === "") {
        return fallback;
      }

      try {
        return JSON.parse(raw);
      } catch (err) {
        if (typeof context.diagnosticLog === "function") {
          context.diagnosticLog("issue-watcher route parse-json-failed: " + JSON.stringify({
            step_id: sourceStepId,
            raw_preview: raw.slice(0, 180),
            error: String(err && err.message ? err.message : err)
          }));
        }
        throw new Error("Invalid JSON body from " + sourceStepId + ": " + String(err && err.message ? err.message : err));
      }
    }

    var data = JSON.parse(context.getData());
    var eventPayload = JSON.parse(context.getBody());
    var issueNumber = eventPayload.issue_number;
    var repo = eventPayload.repo;
    var entityType = eventPayload.entity_type.toLowerCase();
    var decisionLoggingEnabled = data.issueWatcherDecisionLoggingEnabled ?? false;
    var actionDeploymentId = eventPayload.action_deployment_id;
    var actionStepId = eventPayload.action_step_id;
    var matchedLabel = eventPayload.matched_label;

    if (decisionLoggingEnabled) {
        var details = {
            issue: issueNumber,
            entity_type: entityType,
            repo: repo,
            labels: eventPayload.labels,
            incoming_deployment_id: actionDeploymentId,
            incoming_step_id: actionStepId,
            matched_label: matchedLabel
        };
        var message = "issue-watcher route received-event: " + JSON.stringify(details);
        if (typeof context.diagnosticLog === "function") {
            context.diagnosticLog(message);
        } else {
            console.log(message);
        }
    }

    var commentsResponse = context.sendToStep("fetch-issue-comments", JSON.stringify({
        repo: repo,
        issue: issueNumber,
        entity_type: entityType,
        pull_number: issueNumber
    }));
    var commentsResult = parseJson(commentsResponse ? commentsResponse.getBody() : "", { status: "ok", comments: [] }, "fetch-issue-comments");
    if (decisionLoggingEnabled) {
        var msg = "issue-watcher route comments-fetch-complete: " + JSON.stringify({
            issue: issueNumber,
            entity_type: entityType,
            comments_count: commentsResult.comments.length,
            status: commentsResult.status
        });
        if (typeof context.diagnosticLog === "function") {
            context.diagnosticLog(msg);
        } else {
            console.log(msg);
        }
    }
    var comments = commentsResult.comments;

    var payload = {
        matched_label: matchedLabel,
        repo: repo,
        issue: issueNumber,
        issue_url: eventPayload.issue_url,
        title: eventPayload.title,
        issue_body: eventPayload.issue_body,
        comments: comments,
        issue_context: eventPayload.issue_context,
        entity_type: entityType,
        labels: eventPayload.labels,
        action_deployment_id: actionDeploymentId,
        action_step_id: actionStepId,
        updated_at: eventPayload.updated_at
    };

    var actionResponse = context.sendToStep(actionDeploymentId, actionStepId, JSON.stringify(payload));
    var actionBody = parseJson(actionResponse ? actionResponse.getBody() : "", null, actionStepId);

    var isFailure = !actionBody || actionBody.queued === false || actionBody.status === "error" || actionBody.routed === false || actionBody.error;
    var isAcknowledged = !isFailure && (actionBody.queued === true || actionBody.routed === true ||
        ["ok", "accepted", "queued"].includes(String(actionBody.status).toLowerCase()));

    if (!isAcknowledged) {
        context.setBody(JSON.stringify({
            routed: false,
            action_deployment_id: actionDeploymentId,
            action_step_id: actionStepId,
            matched_label: matchedLabel,
            repo: repo,
            issue: issueNumber,
            error: isFailure ? "downstream-dispatch-failed" : "downstream-dispatch-not-acknowledged",
            response: actionBody
        }));
        return;
    }

    context.setBody(JSON.stringify({
        routed: true,
        action_deployment_id: actionDeploymentId,
        action_step_id: actionStepId,
        matched_label: matchedLabel,
        repo: repo,
        issue: issueNumber
    }));
  });
