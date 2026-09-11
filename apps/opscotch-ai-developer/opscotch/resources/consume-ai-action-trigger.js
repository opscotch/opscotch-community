doc
  .description("Consume a terminal AI-action trigger to prevent watcher re-dispatch loops")
  .asUserErrors()
  .inSchema({
    type: "object",
    required: ["repo", "issue", "matched_label", "updater_deployment_access_id", "updater_step_id"],
    additionalProperties: false,
    properties: {
      repo: { type: "string", minLength: 3, pattern: "^[^/]+/[^/]+$" },
      issue: { type: "number", minimum: 1 },
      matched_label: { type: "string", minLength: 1 },
      issue_context: { type: "object" },
      updater_deployment_access_id: { type: "string", minLength: 1 },
      updater_step_id: { type: "string", minLength: 1 },
      outcome_label: { type: "string", minLength: 1 },
      return_assignee: { type: "string", minLength: 1 }
    }
  })
  .outSchema({
    type: "object",
    required: ["status", "labels", "assignees"],
    additionalProperties: false,
    properties: {
      status: { type: "string", enum: ["ok"] },
      labels: { type: "array", items: { type: "string" } },
      assignees: { type: "array", items: { type: "string" } }
    }
  })
  .run(() => {
    var payload = JSON.parse(context.getBody());

    function norm(value) {
      return String(value ?? "").trim();
    }

    function callUpdater(body, name) {
      var response = context.sendToStep(
        payload.updater_deployment_access_id,
        payload.updater_step_id,
        JSON.stringify(body)
      );
      if (response.isErrored()) throw new Error("updater " + name + " step errored");
      var result = JSON.parse(response.getBody() ?? "{}");
      if (norm(result.status).toLowerCase() !== "ok") {
        throw new Error("updater " + name + " failed: " + JSON.stringify(result));
      }
    }

    function labelsFromContext(issueContext) {
      if (!Array.isArray(issueContext?.labels)) return null;
      var seen = {};
      var labels = [];
      issueContext.labels.forEach(function(value) {
        var label = norm(value?.name ?? value);
        var key = label.toLowerCase();
        if (label && !seen[key]) {
          seen[key] = true;
          labels.push(label);
        }
      });
      return labels;
    }

    function isCurrentAssignee(login, issueContext) {
      var target = norm(login).toLowerCase();
      if (!target || !Array.isArray(issueContext?.assignees)) return false;
      return issueContext.assignees.some(function(value) {
        return norm(typeof value === "string" ? value : value?.login).toLowerCase() === target;
      });
    }

    var matchedLower = norm(payload.matched_label).toLowerCase();
    // The bootstrap may select a different label for a successful terminal
    // action. An omitted value retains the historical trigger-label restore.
    var outcomeLabel = norm(payload.outcome_label) || norm(payload.matched_label);
    var outcomeLower = outcomeLabel.toLowerCase();
    var existing = labelsFromContext(payload.issue_context);
    var labels;

    if (existing !== null) {
      labels = existing.filter(function(label) {
        var lower = label.toLowerCase();
        return lower !== matchedLower && lower !== outcomeLower && lower !== "in progress";
      });
      labels.push(outcomeLabel);
      callUpdater({
        operation: "update-issue",
        repo: payload.repo,
        issue: payload.issue,
        labels: labels
      }, "consume-labels");
    } else {
      [payload.matched_label, outcomeLabel, "in progress"].forEach(function(label, index, labelsToRemove) {
        if (index > 0 && norm(label).toLowerCase() === norm(labelsToRemove[0]).toLowerCase()) return;
        callUpdater({ operation: "remove-label", repo: payload.repo, issue: payload.issue, label: label }, "remove-label");
      });
      callUpdater({ operation: "add-labels", repo: payload.repo, issue: payload.issue, labels: [outcomeLabel] }, "set-outcome-label");
      labels = [outcomeLabel];
    }

    var assignees = [];
    callUpdater({
      operation: "update-issue",
      repo: payload.repo,
      issue: payload.issue,
      assignees: assignees
    }, "clear-assignees");

    context.setBody(JSON.stringify({ status: "ok", labels: labels, assignees: assignees }));
  });
