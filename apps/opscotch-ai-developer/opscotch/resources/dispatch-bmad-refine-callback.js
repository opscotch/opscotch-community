doc
  .description("Process CLI sidecar async refine callback and apply issue updates")
  .asUserErrors()
  .inSchema({
    type: "object",
    required: ["status", "callback_context"],
    properties: {
      status: { type: "string", enum: ["ok", "error"] },
      request_id: { type: "string" },
      operation: { type: "string" },
      callback_context: {
        type: "object",
        required: [
          "repo",
          "issue",
          "matched_label",
          "base_branch",
          "issue_body",
          "updater_deployment_access_id",
          "updater_add_comment_step_id",
          "updater_update_issue_step_id",
          "updater_delete_comment_step_id",
          "workflow",
          "request_id",
          "issue_context"
        ],
        properties: {
          repo: { type: "string" },
          issue: { type: "number" },
          matched_label: { type: "string" },
          base_branch: { type: "string" },
          issue_body: { type: ["string", "null"], description: "Issue or PR body; GitHub returns null when empty" },
          start_comment_id: { type: "number" },
          updater_deployment_access_id: { type: "string" },
          updater_add_comment_step_id: { type: "string" },
          updater_update_issue_step_id: { type: "string" },
          updater_delete_comment_step_id: { type: "string" },
          workflow: { type: "string" },
          request_id: { type: "string" },
          issue_context: {
            type: "object",
            required: ["user", "labels"],
            properties: {
              user: {
                type: "object",
                required: ["login"],
                properties: {
                  login: { type: "string" }
                }
              },
              labels: { type: "array", minItems: 1 }
            }
          }
        }
      },
      output: {
        type: "object",
        properties: {
          updated_issue_body_markdown: { type: "string" },
          update_comment_markdown: { type: "string" }
        }
      },
      error: {
        type: "object",
        required: ["code", "message"],
        properties: {
          code: { type: "string" },
          message: { type: "string" }
        }
      }
    }
  })
  .outSchema({
    type: "object",
    required: ["status", "request_id"],
    properties: {
      status: { type: "string", enum: ["ok", "error"] },
      request_id: { type: "string" }
    }
  })
  .run(() => {
    var callbackBody = JSON.parse(context.getBody());
    var state = callbackBody.callback_context;

    function emitMetric(outcome, extra) {
      var operation = state.pr_review_only === true ? "adversarial_review" : "refine";
      var metadata = { repo: state.repo, issue_or_pr: state.pull_number ?? state.issue, request_id: state.request_id, run_id: state.run_id, idempotency_key: state.idempotency_key };
      Object.keys(extra || {}).forEach(function(key) { metadata[key] = extra[key]; });
      context.sendToStepAndForget("emit-ai-developer-metric", JSON.stringify({
        operation: operation,
        stage: "callback",
        outcome: outcome,
        value: 1.0,
        metadata: outcome === "failure" ? Object.assign({}, metadata, { error: "true" }) : metadata
      }));
    }

    function logDiagnostic(message, details) {
      var line = message + (details ? ": " + JSON.stringify(details) : "");
      context.diagnosticLog(line);
    }

    function operationalComment(message) {
      return String(message ?? "").trim() + "\n\n<!-- OPSCOTCH_AI_DEVELOPER_OPERATIONAL -->";
    }

    function getLabels(issueContext) {
      return (issueContext?.labels ?? []).map(function(label) {
        if (typeof label === "string") {
          return label.trim();
        }
        return String(label?.name ?? "").trim();
      }).filter(function(n) { return n; });
    }

    function buildRecoveryLabels(issueContext, matched) {
      var existing = getLabels(issueContext);
      var out = [];
      var seen = {};
      var matchedLower = matched.toLowerCase();

      existing.forEach(function(label) {
        var lower = label.toLowerCase();
        if (lower === "in progress" || lower === matchedLower) return;
        if (!seen[lower]) {
          seen[lower] = true;
          out.push(label);
        }
      });
      return out;
    }

    // Keep issue-body rewrites behind one helper so any future description
    // updater preserves the same branch-field rules.
    function originalBodyHadBranchField(issueBody, fieldName) {
      var name = String(fieldName ?? "").trim();
      if (!name) return false;
      return new RegExp("(?:^|\\s)" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*=\\s*[^\\s`]+", "i")
        .test(String(issueBody ?? ""));
    }

    function rewriteIssueBodyMarkdown(updatedBody, originalIssueBody, branchValues) {
      // Only restore branch fields when the original issue body already carried them.
      // That keeps unrelated issue-description edits from introducing new branch metadata.
      var refined = String(updatedBody ?? "").trim();
      var fields = Array.isArray(branchValues) ? branchValues : [];
      if (!refined || fields.length === 0) return refined;

      fields.forEach(function(field) {
        var fieldName = String(field?.name ?? "").trim();
        var branch = String(field?.value ?? "").trim();
        if (!fieldName || !branch) return;
        if (!originalBodyHadBranchField(originalIssueBody, fieldName)) return;
        if (originalBodyHadBranchField(refined, fieldName)) return;
        refined += "\n\n" + fieldName + "=" + branch;
      });

      return refined;
    }

    function callUpdater(stepId, payload, opName) {
      var result = context.sendToStep(state.updater_deployment_access_id, stepId, JSON.stringify(payload));
      if (result.isErrored()) {
        var details = [];
        try {
          var errors = result.getAllErrors();
          if (errors) details = errors;
        } catch (e) { /* ignore */ }
        throw new Error("updater " + opName + " step errored" + (details.length ? ": " + details.join("; ") : ""));
      }
      var body = JSON.parse(result.getBody());
      if (body.status.toLowerCase() !== "ok") {
        throw new Error("updater " + opName + " failed: " + JSON.stringify(body));
      }
      return body;
    }

    function updateIssueLabels(labels, opName) {
      callUpdater(state.updater_update_issue_step_id, {
        repo: state.repo,
        issue: state.issue,
        labels: labels
      }, opName);
    }

    function consumeAction(outcomeLabel, returnAssignee) {
      var result = context.sendToStep("consume-ai-action-trigger", JSON.stringify({
        repo: state.repo,
        issue: state.issue,
        matched_label: state.matched_label,
        issue_context: state.issue_context,
        updater_deployment_access_id: state.updater_deployment_access_id,
        updater_step_id: state.updater_update_issue_step_id,
        outcome_label: outcomeLabel || state.success_label || "",
        return_assignee: returnAssignee || ""
      }));
      if (result.isErrored()) throw new Error("consume-ai-action-trigger step errored");
      var body = JSON.parse(result.getBody() ?? "{}");
      if ((body.status ?? "").toLowerCase() !== "ok") {
        throw new Error("consume-ai-action-trigger failed: " + JSON.stringify(body));
      }
    }

    function buildPrReviewLabels(issueContext, matched) {
      var existing = getLabels(issueContext);
      var matchedLower = String(matched ?? "").trim().toLowerCase();
      var out = [];
      var seen = {};
      existing.forEach(function(label) {
        var lower = label.toLowerCase();
        if (!label || lower === matchedLower || lower === "in progress" || lower === "pr review") return;
        if (!seen[lower]) { seen[lower] = true; out.push(label); }
      });
      out.push("pr review");
      return out;
    }

    function isConditionAssignee(assignee, issueContext) {
      var target = String(assignee ?? "").trim().toLowerCase();
      if (!target) return false;
      var currentAssignees = Array.isArray(issueContext?.assignees) ? issueContext.assignees : [];
      return currentAssignees.some(function(item) {
        var login = typeof item === "string" ? item : item?.login;
        return String(login ?? "").trim().toLowerCase() === target;
      });
    }

    function assignIssue(assignee, opName) {
      if (!assignee) return;
      var assignees = isConditionAssignee(assignee, state.issue_context) ? [] : [assignee];
      try {
        callUpdater(state.updater_update_issue_step_id, {
          repo: state.repo,
          issue: state.issue,
          assignees: assignees
        }, opName);
      } catch (e) {
        logDiagnostic("refine-callback assignment failed", {
          repo: state.repo,
          issue: state.issue,
          assignee: assignee,
          operation: opName,
          error: String(e?.message ?? e)
        });
        try {
          callUpdater(state.updater_add_comment_step_id, {
            repo: state.repo,
            issue: state.issue,
            comment: "Automated issue assignee update failed.\n\n- operation: " + opName + "\n- requested_assignee: " + assignee + "\n- requested_assignees: " + JSON.stringify(assignees) + "\n- error: " + String(e?.message ?? e)
          }, "report-assignment-failure");
        } catch (commentError) {
          logDiagnostic("refine-callback assignment failure comment failed", {
            repo: state.repo,
            issue: state.issue,
            operation: opName,
            error: String(commentError?.message ?? commentError)
          });
        }
      }
    }

    function notifyFailure(errorMsg) {
      var code = callbackBody.error ? callbackBody.error.code : "cli_sidecar_invoke_failed";
      var message = callbackBody.error ? callbackBody.error.message : errorMsg;
      callUpdater(state.updater_add_comment_step_id, {
        repo: state.repo,
        issue: state.issue,
        comment: operationalComment("CLI sidecar refinement failed.\n\n- status: failed\n- request_id: " + callbackBody.request_id + "\n- error_code: " + code + "\n- error_message: " + message)
      }, "add-comment");

      consumeAction(state.pr_review_only === true ? "pr review" : state.matched_label, state.issue_context?.user?.login);
      emitMetric("failure", { error: "true", error_code: code, error_message: message });
    }

    logDiagnostic("refine-callback received", {
      request_id: callbackBody.request_id,
      status: callbackBody.status,
      operation: callbackBody.operation
    });

    try {
      if (callbackBody.status.toLowerCase() === "ok") {
        logDiagnostic("refine-callback processing-success", { issue: state.issue, repo: state.repo, request_id: state.request_id });
        var output = callbackBody.output;
        if (state.pr_review_only === true) {
          var review = String(output?.answer_markdown ?? output?.update_comment_markdown ?? "").trim() || "No actionable issues found in the adversarial review.";
          consumeAction("pr review", "");
          callUpdater(state.updater_add_comment_step_id, {
            repo: state.repo,
            issue: state.issue,
            comment: "## Adversarial review\n\n" + review
          }, "add-pr-review-comment");
          if (state.start_comment_id != null) {
            callUpdater(state.updater_delete_comment_step_id, { repo: state.repo, issue: state.issue, comment_id: state.start_comment_id }, "delete-pr-review-start-comment");
          }
          emitMetric("success");
          context.setProperty("status_code", "200");
          context.setBody(JSON.stringify({ status: "ok", request_id: state.request_id }));
          return;
        }
        var refinedBody = rewriteIssueBodyMarkdown(output.updated_issue_body_markdown, state.issue_body, [
          { name: "base_branch", value: state.base_branch },
          { name: "community_branch", value: state.community_branch }
        ]);
        var updateComment = output.update_comment_markdown.trim();

        if (!refinedBody) {
          throw new Error("invalid_refinement_output");
        }

        callUpdater(state.updater_update_issue_step_id, {
          repo: state.repo,
          issue: state.issue,
          body: refinedBody
        }, "update-issue");
        consumeAction(state.success_label || state.matched_label, state.issue_context?.user?.login);

        if (!updateComment) {
          updateComment = "Issue refined and body updated by CLI sidecar reviewer.";
        }
        if (state.workflow.toLowerCase() === "implementation-planning") {
          updateComment += "\n\nNext step: add `base_branch=<branch>` in a comment, then author approval (e.g. `LGTM`) to start development.";
        }
        callUpdater(state.updater_add_comment_step_id, { repo: state.repo, issue: state.issue, comment: updateComment }, "add-comment");

        if (state.start_comment_id != null) {
          callUpdater(state.updater_delete_comment_step_id, { repo: state.repo, issue: state.issue, comment_id: state.start_comment_id }, "delete-comment");
        }
        emitMetric("success");
      } else {
        logDiagnostic("refine-callback processing-error", { issue: state.issue, repo: state.repo, request_id: state.request_id, error_code: callbackBody.error.code, error_message: callbackBody.error.message });
        notifyFailure("CLI sidecar refinement failed");
      }

      logDiagnostic("refine-callback completed", { issue: state.issue, repo: state.repo, request_id: state.request_id });
      context.setProperty("status_code", "200");
      context.setBody(JSON.stringify({ status: "ok", request_id: state.request_id }));
    } catch (err) {
      var errorMessage = err && err.message ? err.message : String(err);
      logDiagnostic("refine-callback exception", { issue: state.issue, repo: state.repo, request_id: state.request_id, error: errorMessage });
      try {
        notifyFailure(errorMessage);
      } catch (e) {
        logDiagnostic("refine-callback notifyFailure failed", {
          issue: state.issue,
          repo: state.repo,
          request_id: state.request_id,
          error: String(e?.message ?? e)
        });
        context.sendMetric(context.getTimestamp(), "opscotch_ai_developer.errors", 1.0, { error: "true", operation: "refine", stage: "callback", error_code: "github_update_failed" });
        context.sendMetric(context.getTimestamp(), "opscotch_ai_developer.refine.errors", 1.0, { error: "true", operation: "refine", stage: "callback", error_code: "github_update_failed" });
        context.setBody(JSON.stringify({
          status: "error",
          request_id: state.request_id,
          error: { code: "github_update_failed", message: String(e?.message ?? e) }
        }));
        throw e;
      }
      context.setProperty("status_code", "200");
      context.setBody(JSON.stringify({ status: "ok", request_id: state.request_id }));
    }
  });
