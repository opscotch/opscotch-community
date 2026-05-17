doc
  .description("Route PR events to configured deployment/step targets")
  .asUserErrors()
  .inSchema({
    type: "object",
    required: [
      "repo",
      "issue_number",
      "pull_number",
      "pull_context",
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
    properties: {
      entity_type: { type: "string" },
      repo: { type: "string" },
      issue_number: { type: "integer" },
      pull_number: { type: "integer" },
      pull_url: { type: "string" },
      title: { type: "string" },
      issue_body: { type: "string" },
      issue_context: { type: "object" },
      pull_context: { type: "object" },
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
  .outSchema({
    type: "object",
    required: ["routed", "action_deployment_id", "action_step_id", "matched_label", "repo", "issue", "pull_number"],
    properties: {
      routed: { type: "boolean" },
      action_deployment_id: { type: "string" },
      action_step_id: { type: "string" },
      matched_label: { type: "string" },
      repo: { type: "string" },
      issue: { type: "integer" },
      pull_number: { type: "integer" },
      error: { type: "string" },
      response: { type: "object" }
    }
  })
  .run(() => {
    function logDecision(enabled, eventName, details) {
      if (!enabled) return;
      var message = "pr-watcher route " + eventName + ": " + JSON.stringify(details || {});
      if (typeof context.diagnosticLog === "function") {
        context.diagnosticLog(message);
        return;
      }
      console.log(message);
    }

    function fetchCommentsByType(repo, issue, pullNumber, entityType, loggingEnabled) {
      var response = context.sendToStep("fetch-issue-comments", JSON.stringify({
        repo: repo,
        issue: issue,
        entity_type: entityType,
        pull_number: pullNumber
      }));
      var result = JSON.parse(response.getBody());
      if (!Array.isArray(result.comments)) {
        throw new Error("fetch-issue-comments returned non-array comments for entity_type=" + entityType);
      }
      logDecision(loggingEnabled, "comments-fetch-complete", {
        issue: issue,
        pull_number: pullNumber,
        entity_type: entityType,
        comments_count: result.comments.length,
        status: result.status
      });
      return result.comments;
    }

    function dedupeComments(comments) {
      var out = [];
      var seen = {};
      for (var i = 0; i < comments.length; i += 1) {
        var c = comments[i] || {};
        var key = "";
        if (c.id !== undefined && c.id !== null) {
          key = "id:" + String(c.id);
        } else if (c.node_id) {
          key = "node_id:" + String(c.node_id);
        } else {
          key = "body:" + String(c.body || "") + "|created_at:" + String(c.created_at || "");
        }
        if (seen[key]) continue;
        seen[key] = true;
        out.push(c);
      }
      return out;
    }

    function fetchComments(repo, issue, pullNumber, loggingEnabled) {
      var issueComments = fetchCommentsByType(repo, issue, pullNumber, "issue", loggingEnabled);
      var prReviewComments = fetchCommentsByType(repo, issue, pullNumber, "pr", loggingEnabled);
      var merged = dedupeComments(issueComments.concat(prReviewComments));
      logDecision(loggingEnabled, "comments-merge-complete", {
        issue: issue,
        pull_number: pullNumber,
        issue_comments_count: issueComments.length,
        pr_review_comments_count: prReviewComments.length,
        merged_comments_count: merged.length
      });
      return merged;
    }

    function sendAction(deploymentId, stepId, payload) {
      if (!deploymentId || !stepId) {
        throw new Error("Explicit action_deployment_id and action_step_id are required");
      }
      return context.sendToStep(deploymentId, stepId, JSON.stringify(payload));
    }

    function isDispatchFailure(responseBody) {
      if (!responseBody || typeof responseBody !== "object") return true;
      if (responseBody.queued === false) return true;
      if (responseBody.status === "error") return true;
      if (responseBody.routed === false) return true;
      if (responseBody.error) return true;
      return false;
    }

    function isDispatchAcknowledged(responseBody) {
      if (isDispatchFailure(responseBody)) return false;
      if (responseBody.queued === true) return true;
      if (responseBody.routed === true) return true;
      var status = typeof responseBody.status === "string" ? responseBody.status.toLowerCase() : "";
      return status === "ok" || status === "accepted" || status === "queued";
    }

    var data = JSON.parse(context.getData());
    var eventPayload = JSON.parse(context.getBody());
    var repo = eventPayload.repo;
    var issueNumber = eventPayload.issue_number;
    var pullNumber = eventPayload.pull_number;
    var decisionLoggingEnabled = data.issueWatcherDecisionLoggingEnabled;
    var actionDeploymentId = eventPayload.action_deployment_id;
    var actionStepId = eventPayload.action_step_id;
    var matchedLabel = eventPayload.matched_label;

    logDecision(decisionLoggingEnabled, "received-event", {
      issue: issueNumber,
      pull_number: pullNumber,
      repo: repo,
      labels: eventPayload.labels,
      incoming_deployment_id: actionDeploymentId,
      incoming_step_id: actionStepId,
      matched_label: matchedLabel
    });

    var comments = fetchComments(repo, issueNumber, pullNumber, decisionLoggingEnabled);
    var payload = {
      matched_label: matchedLabel,
      repo: repo,
      issue: issueNumber,
      pull_number: pullNumber,
      pull_url: eventPayload.pull_url,
      title: eventPayload.title,
      issue_body: eventPayload.issue_body,
      comments: comments,
      issue_context: eventPayload.issue_context,
      pull_context: eventPayload.pull_context,
      entity_type: "pr",
      labels: eventPayload.labels,
      action_deployment_id: actionDeploymentId,
      action_step_id: actionStepId,
      updated_at: eventPayload.updated_at
    };

    var actionResponse = sendAction(actionDeploymentId, actionStepId, payload);
    var actionBody = actionResponse ? JSON.parse(actionResponse.getBody()) : null;
    if (!isDispatchAcknowledged(actionBody)) {
      context.setBody(JSON.stringify({
        routed: false,
        action_deployment_id: actionDeploymentId,
        action_step_id: actionStepId,
        matched_label: matchedLabel,
        repo: repo,
        issue: issueNumber,
        pull_number: pullNumber,
        error: isDispatchFailure(actionBody) ? "downstream-dispatch-failed" : "downstream-dispatch-not-acknowledged",
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
      issue: issueNumber,
      pull_number: pullNumber
    }));
  });
