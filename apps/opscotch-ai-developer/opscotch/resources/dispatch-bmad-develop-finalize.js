doc
  .description("Finalize develop flow with status/comments/transitions")
  .asUserErrors()
  .inSchema({
    type: "object",
    required: [
      "repo",
      "issue",
      "request_id",
      "idempotency_key",
      "run_id",
      "base_branch",
      "work_branch",
      "updater_deployment_access_id",
      "updater_step_id",
      "payload",
      "invoke_response",
      "mapped"
    ],
    additionalProperties: true,
    properties: {
      repo: { type: "string", minLength: 3, pattern: "^[^/]+\\/[^/]+$", description: "Repository in owner/repo format" },
      issue: { type: "number", minimum: 1, description: "Issue number" },
      request_id: { type: "string", minLength: 1, description: "Unique request identifier" },
      idempotency_key: { type: "string", minLength: 1, description: "Key for deduplication" },
      queue_idempotency_key: { type: "string", description: "Queue-specific idempotency key" },
      run_id: { type: "string", minLength: 1, description: "Run identifier" },
      base_branch: { type: "string", minLength: 1, description: "Base branch name" },
      work_branch: { type: "string", minLength: 1, description: "Work branch name" },
      updater_deployment_access_id: { type: "string", minLength: 1, description: "Deployment access id for updates" },
      updater_step_id: { type: "string", minLength: 1, description: "Step ID for updates" },
      condition_assignee: { type: "string", description: "Condition assignee that triggered the workflow" },
      payload: {
        type: "object",
        required: ["issue_body", "issue_context"],
        additionalProperties: true,
        description: "Original issue payload",
        properties: {
          issue_body: { type: ["string", "null"], description: "Original issue or PR body; GitHub returns null when empty" },
          issue_context: { type: "object", description: "Issue context with user, labels, etc" }
        }
      },
      invoke_response: { type: "object", additionalProperties: true, description: "Response from invoke" },
      mapped: { type: "object", additionalProperties: true, description: "Mapped response" }
    }
  })
  .outSchema({
    type: "object",
    properties: {
      status: { type: "string", enum: ["ok", "error"], description: "Final status" }
    }
  })
  .run(() => {

    // Parse state - getBody returns string
    var state = JSON.parse(context.getBody());
    var responseBody = state.invoke_response;
    var mappedBody = state.mapped;

    // Helper: normalize string with nullish coalescing
    function norm(value) {
      return String(value ?? "");
    }

    // Helper: check success response
    function isOk(body) {
      return body && (body.status ?? "").toLowerCase() === "ok";
    }

    // Helper: check rate limited
    function isRateLimited(body) {
      var code = (body?.error?.code ?? "").toLowerCase();
      if (code === "rate_limited") return true;
      var message = (body?.error?.message ?? "").toLowerCase();
      return message.includes("429") || message.includes("rate limit");
    }

    // Helper: extract label names
    function getLabelNames(issueContext) {
      var labels = issueContext?.labels ?? [];
      return labels.map(function(l) { return norm(l?.name ?? l); }).filter(function(n) { return n; });
    }

    // Helper: build PR review labels
    function buildReviewLabels(issueContext, matched) {
      var existing = getLabelNames(issueContext);
      var matchedLower = matched?.toLowerCase() ?? "";
      var out = existing.filter(function(l) {
        var lower = l.toLowerCase();
        return lower !== matchedLower && lower !== "ready for dev" && lower !== "question" && lower !== "adversarial review" && lower !== "in progress" && lower !== "pr review";
      });
      out.push("pr review");
      return out;
    }

    function buildRecoveryLabels(issueContext, matched) {
      var existing = getLabelNames(issueContext);
      var matchedLabel = norm(matched).trim();
      var matchedLower = matchedLabel.toLowerCase();
      var out = [];
      var seen = {};
      existing.forEach(function(label) {
        var clean = norm(label).trim();
        var lower = clean.toLowerCase();
        if (!clean || lower === "in progress" || lower === matchedLower) return;
        if (!seen[lower]) {
          seen[lower] = true;
          out.push(clean);
        }
      });
      return out;
    }

    // Helper: build PR body
    function buildPrBody(output, issueNum, originalBody) {
      var prBody = (output?.pr_body_markdown ?? "").trim();
      var summary = (output?.summary_markdown ?? "").trim();
      var testSummary = (output?.test_summary_markdown ?? "").trim();
      if (!prBody) throw new Error("pr_body_markdown is required");
      if (!summary) throw new Error("summary_markdown is required");
      if (!testSummary) throw new Error("test_summary_markdown is required");
      var parts = [prBody, "## Summary\n\n" + summary, "## Test Summary\n\n" + testSummary];
      parts.push("Closes #" + issueNum);
      if (originalBody) parts.push("## Original Issue Body (Preserved)\n\n" + originalBody.trim());
      return parts.join("\n\n");
    }

    function changedRepositories(output) {
      var changed = [];
      if (Array.isArray(output?.repositories)) {
        changed = output.repositories.filter(function(repo) {
          return Array.isArray(repo?.changed_files) && repo.changed_files.length > 0;
        }).map(function(repo) {
          return {
            repo: norm(repo?.repo),
            base_branch: norm(repo?.base_branch ?? repo?.branch),
            work_branch: norm(repo?.work_branch ?? output?.work_branch),
            head_sha: norm(repo?.head_sha),
            changed_files: Array.isArray(repo?.changed_files) ? repo.changed_files : [],
            primary: repo?.primary === true
          };
        });
      } else if (Array.isArray(output?.changed_files) && output.changed_files.length > 0) {
        changed = [{
          repo: state.repo,
          base_branch: norm(output?.base_branch ?? state.base_branch),
          work_branch: norm(output?.work_branch ?? state.work_branch),
          head_sha: norm(output?.head_sha),
          changed_files: output.changed_files,
          primary: true
        }];
      }

      // A single changed repository is the implementation owner even when it
      // was configured as a linked secondary repository for the source issue.
      if (changed.length === 1) {
        changed[0].primary = true;
      } else if (changed.length > 1 && !changed.some(function(repo) { return repo.primary; })) {
        // Keep multi-repository runs deterministic if an older config lacks a
        // primary marker; current configs should still supply one explicitly.
        changed[0].primary = true;
      }
      return changed;
    }

    function sourceIssueRef() {
      return state.repo + "#" + state.issue;
    }

    function branchList(repositories) {
      return repositories.map(function(repo) {
        return "- " + repo.repo + ": `" + repo.work_branch + "` (base `" + repo.base_branch + "`)";
      }).join("\n");
    }

    function buildPrBodyForRepository(output, repoResult, allChangedRepos, originalBody) {
      var base = buildPrBody(output, state.issue, repoResult.repo === state.repo ? originalBody : "");
      var sourceLine = repoResult.repo === state.repo ? "Closes #" + state.issue : "Source issue: " + sourceIssueRef();
      if (repoResult.repo !== state.repo) {
        base = base.replace(/\n\nCloses #\d+\s*$/m, "");
      }
      return [
        base,
        "## Source Issue",
        "",
        sourceLine,
        "",
        "## Related Implementation Branches",
        "",
        branchList(allChangedRepos)
      ].join("\n\n");
    }

    function buildRelatedPrComment(prs) {
      var lines = [
        "Related implementation PRs for source issue " + sourceIssueRef() + ":",
        ""
      ];
      prs.forEach(function(pr) {
        lines.push("- " + pr.repo + "#" + pr.pull_number + " on `" + pr.work_branch + "`");
      });
      return lines.join("\n");
    }

    function buildSourceIssueComment(prs) {
      var lines = ["Development complete.", "", "Implementation PRs:", ""];
      prs.forEach(function(pr) {
        lines.push("- " + pr.repo + "#" + pr.pull_number);
        lines.push("  - base_branch: `" + pr.base_branch + "`");
        lines.push("  - work_branch: `" + pr.work_branch + "`");
        lines.push("  - changed_files: " + pr.changed_files.length);
      });
      return lines.join("\n");
    }

    // Helper: call updater step
    function callUpdaterStrict(depId, stepId, payload, opName) {
      var result = context.sendToStep(depId, stepId, JSON.stringify(payload));
      if (result.isErrored()) {
        var detail = {
          op: opName,
          deployment_access_id: depId,
          step_id: stepId
        };
        try {
          var erroredBodyText = result.getBody();
          if (erroredBodyText) {
            try {
              detail.body = JSON.parse(erroredBodyText);
            } catch (e) {
              detail.body = erroredBodyText;
            }
          }
        } catch (e) { /* ignore */ }
        try {
          var errors = result.getAllErrors();
          if (errors) detail.step_errors = errors;
        } catch (e) { /* ignore */ }
        throw new Error("updater " + opName + " step errored: " + JSON.stringify(detail));
      }
      var body = JSON.parse(result?.getBody() ?? "{}");
      if ((body.status ?? "").toLowerCase() !== "ok") {
        throw new Error("updater " + opName + " failed: " + JSON.stringify({
          op: opName,
          deployment_access_id: depId,
          step_id: stepId,
          response: body
        }));
      }
      return body;
    }

    function logDiagnostic(message, details) {
      var line = message + (details ? ": " + JSON.stringify(details) : "");
      context.diagnosticLog(line);
    }

    function updateIssueLabels(labels, opName) {
      callUpdaterStrict(state.updater_deployment_access_id, state.updater_step_id, {
        operation: "update-issue",
        repo: state.repo,
        issue: state.issue,
        labels: labels
      }, opName);
    }

    function consumeAction(outcomeLabel, returnAssignee) {
      var result = context.sendToStep("consume-ai-action-trigger", JSON.stringify({
        repo: state.repo,
        issue: state.issue,
        matched_label: state.payload?.matched_label,
        issue_context: state.payload?.issue_context,
        updater_deployment_access_id: state.updater_deployment_access_id,
        updater_step_id: state.updater_step_id,
        outcome_label: outcomeLabel || state.success_label || "",
        return_assignee: returnAssignee || ""
      }));
      if (result.isErrored()) throw new Error("consume-ai-action-trigger step errored");
      var body = JSON.parse(result.getBody() ?? "{}");
      if ((body.status ?? "").toLowerCase() !== "ok") {
        throw new Error("consume-ai-action-trigger failed: " + JSON.stringify(body));
      }
    }

    function isConditionAssignee(assignee, issueContext) {
      var target = norm(assignee).trim().toLowerCase();
      if (!target) return false;
      var currentAssignees = Array.isArray(issueContext?.assignees) ? issueContext.assignees : [];
      return currentAssignees.some(function(item) {
        var login = typeof item === "string" ? item : item?.login;
        return norm(login).trim().toLowerCase() === target;
      });
    }

    function assignIssue(assignee, opName) {
      if (!assignee) return;
      var assignees = isConditionAssignee(assignee, state.payload?.issue_context) ? [] : [assignee];
      try {
        callUpdaterStrict(state.updater_deployment_access_id, state.updater_step_id, {
          operation: "update-issue",
          repo: state.repo,
          issue: state.issue,
          assignees: assignees
        }, opName);
      } catch (e) {
        logDiagnostic("develop-finalize assignment failed", {
          repo: state.repo,
          issue: state.issue,
          assignee: assignee,
          operation: opName,
          error: String(e?.message ?? e)
        });
        try {
          callUpdaterStrict(state.updater_deployment_access_id, state.updater_step_id, {
            operation: "add-comment",
            repo: state.repo,
            issue: state.issue,
            comment: "Automated issue assignee update failed.\n\n- operation: " + opName + "\n- requested_assignee: " + assignee + "\n- requested_assignees: " + JSON.stringify(assignees) + "\n- error: " + String(e?.message ?? e)
          }, "report-assignment-failure");
        } catch (commentError) {
          logDiagnostic("develop-finalize assignment failure comment failed", {
            repo: state.repo,
            issue: state.issue,
            operation: opName,
            error: String(commentError?.message ?? commentError)
          });
        }
      }
    }

    // Helper: emit status to tracker
    function emitStatus(event) {
      try {
        context.sendToStepAndForget("track-bmad-develop-status", JSON.stringify(event));
      } catch (e) { /* ignore */ }
    }

    function emitMetric(outcome, extra) {
      var metricOperation = state.pull_number ? "pr_develop" : "develop";
      var metadata = { repo: state.repo, issue_or_pr: state.pull_number ?? state.issue, request_id: state.request_id, run_id: state.run_id, idempotency_key: state.idempotency_key };
      Object.keys(extra || {}).forEach(function(key) { metadata[key] = extra[key]; });
      context.sendToStepAndForget("emit-ai-developer-metric", JSON.stringify({
        operation: metricOperation,
        stage: "finalize",
        outcome: outcome,
        value: 1.0,
        metadata: outcome === "failure" ? Object.assign({}, metadata, { error: "true" }) : metadata
      }));
    }

    // Helper: get issue author
    function getAuthor(payload) {
      return norm(payload?.issue_context?.user?.login);
    }

    function getPullRequestAuthor(prResponse) {
      return norm(prResponse?.user?.login ?? prResponse?.author?.login ?? prResponse?.head?.repo?.owner?.login);
    }

    function getAssignmentTarget() {
      var comments = Array.isArray(state.payload?.comments) ? state.payload.comments : [];
      for (var i = comments.length - 1; i >= 0; i -= 1) {
        var author = norm(comments[i]?.author ?? comments[i]?.user?.login).trim();
        var body = norm(comments[i]?.body);
        if (author && body.indexOf("<!-- OPSCOTCH_AI_DEVELOPER_OPERATIONAL -->") < 0) return author;
      }
      return getAuthor(state.payload);
    }

    function preservedWorkComment(response) {
      var details = response?.error?.details;
      var repositories = Array.isArray(details?.repositories) ? details.repositories : [];
      var changed = repositories.filter(function(repo) {
        return Array.isArray(repo?.changed_files) && repo.changed_files.length > 0;
      });
      if (changed.length === 0) return "";
      var lines = ["", "Partial implementation preserved on pushed branch(es):"];
      changed.forEach(function(repo) {
        lines.push("- " + norm(repo.repo) + ": `" + norm(repo.work_branch) + "` at `" + norm(repo.head_sha) + "` (" + repo.changed_files.length + " changed file(s))");
      });
      return lines.join("\n");
    }

    function isQuestionOperation() {
      return norm(state.operation ?? responseBody?.operation).trim().toLowerCase() === "question";
    }


    // === SUCCESS PATH ===
    if (isOk(responseBody)) {
      if (isQuestionOperation()) {
        var answer = norm(responseBody?.output?.answer_markdown).trim();
        if (!answer) {
          answer = "Question completed but no answer was returned.";
        }
        callUpdaterStrict(state.updater_deployment_access_id, state.updater_step_id, {
          operation: "add-comment",
          repo: state.repo,
          issue: state.issue,
          comment: "AI answer:\n\n" + answer
        }, "add-question-answer-comment");

        consumeAction("pr review", getAssignmentTarget());

        emitStatus({
          operation: "update",
          idempotency_key: norm(mappedBody?.idempotency_key ?? state.queue_idempotency_key ?? (state.idempotency_key + ":question")),
          run_id: norm(mappedBody?.run_id ?? state.run_id),
          repo: state.repo,
          issue: state.issue,
          status: "succeeded",
          request_id: norm(mappedBody?.request_id ?? state.request_id),
          completed_at: norm(mappedBody?.completed_at),
          duration_ms: mappedBody?.duration_ms
        });

        emitMetric("success", { duration_ms: mappedBody?.duration_ms });

        context.setBody(JSON.stringify(responseBody));
        return;
      }

      var output = responseBody.output ?? {};
      var prTitle = norm(output?.pr_title);
      var reposToPr = changedRepositories(output);

      // Check branches and title
      if (!prTitle || reposToPr.some(function(repo) { return !repo.repo || !repo.work_branch || !repo.base_branch; })) {
        emitStatus({
          operation: "update",
          idempotency_key: norm(mappedBody?.idempotency_key ?? state.queue_idempotency_key ?? (state.idempotency_key + ":develop")),
          run_id: norm(mappedBody?.run_id ?? state.run_id),
          repo: state.repo,
          issue: state.issue,
          status: "failed",
          request_id: norm(mappedBody?.request_id ?? state.request_id)
        });
        context.setBody(JSON.stringify(responseBody));
        return;
      }

      var author = getAuthor(state.payload);
      var createdPrs = [];
      for (var i = 0; i < reposToPr.length; i += 1) {
        var repoResult = reposToPr[i];
        var lookup = callUpdaterStrict(state.updater_deployment_access_id, state.updater_step_id, {
          operation: "get-open-pr-by-head",
          repo: repoResult.repo,
          issue: state.issue,
          head: repoResult.work_branch
        }, "get-open-pr-by-head");

        var existingPr = (lookup.response ?? [])[0];
        var pullNum = existingPr?.number ? parseInt(existingPr.number, 10) : null;
        var upsertOp = pullNum ? "update-pr" : "create-pr";
        var isCreate = upsertOp === "create-pr";
        var repoPrTitle = reposToPr.length > 1 ? prTitle + " (" + repoResult.repo + ")" : prTitle;
        var prBody = buildPrBodyForRepository(output, repoResult, reposToPr, state.payload?.issue_body);

        var upsertPayload = {
          operation: upsertOp,
          repo: repoResult.repo,
          issue: state.issue,
          title: repoPrTitle,
          body: prBody,
          base: repoResult.base_branch
        };
        if (pullNum) upsertPayload.pull_number = pullNum;
        else upsertPayload.head = repoResult.work_branch;

        var upsert = callUpdaterStrict(state.updater_deployment_access_id, state.updater_step_id, upsertPayload, upsertOp);
        var prResp = upsert.response ?? {};
        var createdNum = parseInt(prResp.number ?? pullNum ?? "0", 10);
        var roleLabel = repoResult.primary ? "primary-pr" : "secondary-pr";
        var prAuthor = getPullRequestAuthor(prResp);
        createdPrs.push({
          repo: repoResult.repo,
          pull_number: createdNum,
          url: norm(prResp.html_url),
          pr_author: prAuthor,
          base_branch: repoResult.base_branch,
          work_branch: repoResult.work_branch,
          head_sha: repoResult.head_sha,
          changed_files: repoResult.changed_files,
          created: isCreate
        });

        if (!isNaN(createdNum) && createdNum > 0) {
          callUpdaterStrict(state.updater_deployment_access_id, state.updater_step_id, {
            operation: "update-issue",
            repo: repoResult.repo,
            issue: createdNum,
            labels: [roleLabel, "pr review"]
          }, "tag-implementation-pr");
        }

        // On create: request reviewer from source issue author.
        // On update: do not modify reviewers.
        if (isCreate && !isNaN(createdNum) && createdNum > 0 && author) {
          if (prAuthor && prAuthor.toLowerCase() === author.toLowerCase()) {
            logDiagnostic("develop-finalize skipped self-review request", {
              repo: repoResult.repo,
              issue: state.issue,
              pull_number: createdNum,
              reviewer: author
            });
          } else {
            try {
              callUpdaterStrict(state.updater_deployment_access_id, state.updater_step_id, {
                operation: "request-reviewers",
                repo: repoResult.repo,
                issue: state.issue,
                pull_number: createdNum,
                reviewers: [author]
              }, "request-reviewers");
            } catch (e) {
              logDiagnostic("develop-finalize reviewer request failed", {
                repo: repoResult.repo,
                issue: state.issue,
                pull_number: createdNum,
                reviewer: author,
                error: String(e?.message ?? e)
              });
            }
          }
        }
      }

      if (createdPrs.length === 0) {
        callUpdaterStrict(state.updater_deployment_access_id, state.updater_step_id, {
          operation: "add-comment",
          repo: state.repo,
          issue: state.issue,
          comment: "Development complete.\n\nNo repository changes were detected after the sidecar run."
        }, "add-comment");
      } else {
        var relatedComment = buildRelatedPrComment(createdPrs);
        for (var c = 0; c < createdPrs.length; c += 1) {
          var pr = createdPrs[c];
          if (!isNaN(pr.pull_number) && pr.pull_number > 0) {
            callUpdaterStrict(state.updater_deployment_access_id, state.updater_step_id, {
              operation: "add-comment",
              repo: pr.repo,
              issue: pr.pull_number,
              comment: relatedComment
            }, "add-related-pr-comment");
          }
        }

        callUpdaterStrict(state.updater_deployment_access_id, state.updater_step_id, {
          operation: "add-comment",
          repo: state.repo,
          issue: state.issue,
          comment: buildSourceIssueComment(createdPrs)
        }, "add-comment");
      }

      // Transition issue
      consumeAction(state.success_label || "pr review", author);

      emitStatus({
        operation: "update",
        idempotency_key: norm(mappedBody?.idempotency_key ?? state.queue_idempotency_key ?? (state.idempotency_key + ":develop")),
        run_id: norm(mappedBody?.run_id ?? state.run_id),
        repo: state.repo,
        issue: state.issue,
        status: "succeeded",
        request_id: norm(mappedBody?.request_id ?? state.request_id),
        completed_at: norm(mappedBody?.completed_at),
        duration_ms: mappedBody?.duration_ms
      });

      emitMetric("success", { duration_ms: mappedBody?.duration_ms });

      context.setBody(JSON.stringify(responseBody));
      return;
    }

    // === RATE LIMITED PATH ===
    if (isRateLimited(responseBody)) {
      context.sendToStepAndForget("track-bmad-develop-status", JSON.stringify({
        operation: "release-dispatch",
        repo: state.repo,
        issue: state.issue,
        idempotency_key: norm(mappedBody?.idempotency_key ?? state.queue_idempotency_key ?? (state.idempotency_key + ":develop"))
      }));

      emitStatus({
        operation: "update",
        idempotency_key: norm(mappedBody?.idempotency_key ?? state.queue_idempotency_key ?? (state.idempotency_key + ":develop")),
        run_id: norm(mappedBody?.run_id ?? state.run_id),
        repo: state.repo,
        issue: state.issue,
        status: "queued",
        request_id: norm(mappedBody?.request_id ?? state.request_id),
        retryable: true,
        error: "true",
        error_code: norm(mappedBody?.error_code ?? "rate_limited"),
        error_message: norm(mappedBody?.error_message ?? "rate limited"),
        attempt: 0
      });

      context.setBody(JSON.stringify(responseBody));
      return;
    }

    // === FAILURE PATH ===
    var errorCode = norm(responseBody?.error?.code ?? "cli_sidecar_invoke_failed");
    var errorMessage = norm(responseBody?.error?.message ?? "CLI sidecar developer call failed.");
    var failureTitle = isQuestionOperation() ? "CLI sidecar question failed." : "CLI sidecar development failed.";

    // Add failure comment
    callUpdaterStrict(state.updater_deployment_access_id, state.updater_step_id, {
      operation: "add-comment",
      repo: state.repo,
      issue: state.issue,
      comment: failureTitle + "\n\n" +
        "- status: failed\n" +
        "- request_id: " + norm(responseBody?.request_id) + "\n" +
        "- error_code: " + errorCode + "\n" +
        "- error_message: " + errorMessage + "\n" +
        "- retryable: true" +
        preservedWorkComment(responseBody)
    }, "add-comment");

    consumeAction(
      isQuestionOperation() ? "pr review" : state.payload?.matched_label,
      isQuestionOperation() ? getAssignmentTarget() : getAuthor(state.payload)
    );

    emitStatus({
      operation: "update",
      idempotency_key: norm(mappedBody?.idempotency_key ?? state.queue_idempotency_key ?? (state.idempotency_key + ":develop")),
      run_id: norm(mappedBody?.run_id ?? state.run_id),
      repo: state.repo,
      issue: state.issue,
      status: "failed",
      request_id: norm(mappedBody?.request_id ?? state.request_id),
      completed_at: norm(mappedBody?.completed_at),
      duration_ms: mappedBody?.duration_ms,
      retryable: mappedBody?.retryable,
      error: "true",
      error_code: errorCode,
      error_message: errorMessage
    });

    emitMetric("failure", { error: "true", error_code: errorCode, error_message: errorMessage, retryable: mappedBody?.retryable, duration_ms: mappedBody?.duration_ms });

    context.setBody(JSON.stringify(responseBody));
  });
