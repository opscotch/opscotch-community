doc
  .description("Dispatch PR update implementation to CLI sidecar developer")
  .asUserErrors()
  .inSchema({
    type: "object",
    required: ["repo", "pull_number", "matched_label"],
    additionalProperties: true,
    properties: {
      repo: { type: "string", description: "Repository in owner/repo format" },
      pull_number: { type: "number", description: "PR number" },
      matched_label: { type: "string", description: "Matched label" },
      pull_context: { type: "object", description: "PR context" },
      assignee: { type: "string", description: "Condition assignee that triggered the workflow" },
      base_branch: { type: "string", description: "Base branch" },
      work_branch: { type: "string", description: "Work branch" },
      instructions: { type: "string", description: "Instructions" }
    }
  })
  .dataSchema({
    type: "object",
    required: ["issueUpdaterDeploymentAccessId", "issueUpdaterStepId", "actionInstructionsByRepoLabel"],
    additionalProperties: true,
    properties: {
      issueUpdaterDeploymentAccessId: { type: "string", minLength: 1, description: "Deployment access id for updates" },
      issueUpdaterStepId: { type: "string", minLength: 1, description: "Step ID for updates" },
      actionInstructionsByRepoLabel: {
        type: "object",
        description: "Instructions and AI settings by repo and label",
        additionalProperties: {
          type: "object",
          additionalProperties: {
            type: "object",
            additionalProperties: false,
            required: ["instructions", "ai"],
            properties: {
              instructions: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
              successLabel: { type: "string", minLength: 1, description: "Optional label to apply after successful completion" },
              ai: {
                type: "object",
                additionalProperties: false,
                required: ["provider", "model", "reasoningEffort", "verbosity"],
                properties: {
                  provider: { type: "string", enum: ["codex", "minimax"] },
                  model: { type: "string", minLength: 1 },
                  reasoningEffort: { type: "string", enum: ["none", "minimal", "low", "medium", "high", "xhigh"] },
                  verbosity: { type: "string", enum: ["low", "medium", "high"] }
                }
              }
            }
          }
        }
      },
    }
  })
  .outSchema({
    type: "object",
    properties: {
      status: { type: "string", enum: ["ok", "error"], description: "Response status" }
    }
  })
  .run(() => {

    // Parse body and data - schema validates these
    var payload = JSON.parse(context.getBody());
    var data = JSON.parse(context.getData());

    // Helpers using nullish coalescing
    function normStr(value) {
      return String(value ?? "");
    }

    function createUuid() {
      var ts = Date.now();
      return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
        var r = (ts + Math.random() * 16) % 16 | 0;
        ts = Math.floor(ts / 16);
        return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
      });
    }

    // Normalize PR comments - no fallback needed, schema validates array
    function normalizeComments(list, sourceRepo, sourcePull) {
      var mapped = (list ?? []).map(function(c, i) {
        var hasCodeLocation = !!(c?.path || c?.diff_hunk || c?.line || c?.original_line || c?.originalLine);
        return {
          id: c?.id ?? c?.node_id ?? "pr-c-" + i,
          source: sourceRepo && sourcePull ? ("pr_review:" + sourceRepo + "#" + sourcePull) : "pr_review",
          comment_type: hasCodeLocation ? "pr_code_review" : "pr_conversation",
          repo: sourceRepo || undefined,
          pull_number: sourcePull || undefined,
          author: c?.user?.login ?? c?.author?.login ?? "unknown",
          created_at: c?.created_at ?? "",
          updated_at: c?.updated_at ?? "",
          body: c?.body?.trim() ?? "",
          html_url: c?.html_url ?? c?.url,
          path: c?.path,
          line: c?.line,
          original_line: c?.original_line ?? c?.originalLine,
          start_line: c?.start_line ?? c?.startLine,
          original_start_line: c?.original_start_line ?? c?.originalStartLine,
          side: c?.side,
          start_side: c?.start_side ?? c?.startSide,
          diff_hunk: c?.diff_hunk ?? c?.diffHunk,
          commit_id: c?.commit_id ?? c?.commitId,
          original_commit_id: c?.original_commit_id ?? c?.originalCommitId,
          pull_request_review_id: c?.pull_request_review_id ?? c?.pullRequestReviewId,
          in_reply_to_id: c?.in_reply_to_id ?? c?.inReplyToId,
          review_thread_id: c?.review_thread_id ?? c?.reviewThreadId,
          review_thread_resolved: c?.review_thread_resolved ?? c?.reviewThreadResolved
        };
      }).filter(function(x) { return x?.body; });

      var buildLogMarker = "<!-- CLI_SIDECAR_BUILD_FAILED_STEP_LOG -->";
      var operationalCommentMarker = "<!-- OPSCOTCH_AI_DEVELOPER_OPERATIONAL -->";

      var filtered = mapped.filter(function(c) {
        var body = String(c.body ?? "");
        var isMarkedBuildLog = body.indexOf(buildLogMarker) >= 0;
        if (isMarkedBuildLog) return true;
        return body.indexOf(operationalCommentMarker) < 0;
      });

      var lastMarkedIndex = -1;
      for (var j = 0; j < filtered.length; j += 1) {
        if (String(filtered[j].body ?? "").indexOf(buildLogMarker) >= 0) {
          lastMarkedIndex = j;
        }
      }
      if (lastMarkedIndex >= 0) {
        filtered = filtered.filter(function(c, idx) {
          var isMarkedBuildLog = String(c.body ?? "").indexOf(buildLogMarker) >= 0;
          if (!isMarkedBuildLog) return true;
          return idx === lastMarkedIndex;
        });
      }

      return filtered;
    }

    function makeIssueContext() {
      if (payload.issue_context) return payload.issue_context;
      if (Array.isArray(payload.labels)) return { labels: payload.labels };
      return {};
    }

    // Call updater
    function callUpdater(payload, opName) {
      var result = context.sendToStep(data.issueUpdaterDeploymentAccessId, data.issueUpdaterStepId, JSON.stringify(payload));
      if (result.isErrored()) {
        throw new Error(stepErrorMessage(result, data.issueUpdaterStepId));
      }
      var body = JSON.parse(result?.getBody() ?? "{}");
      if ((body.status ?? "").toLowerCase() !== "ok") {
        throw new Error("updater " + (opName || payload.operation || "call") + " failed: " + JSON.stringify(body));
      }
      return body;
    }

    // Post failure comment
    function postFailureComment(pullNumber, message) {
      try {
        if (!payload.repo || !pullNumber) return;
        callUpdater({
          operation: "add-comment",
          repo: payload.repo,
          issue: pullNumber,
          comment: "PR update failed.\n\n- status: failed\n- error_message: " + (message ?? "unknown error")
        });
      } catch (e) { /* ignore */ }
    }

    // Diagnostic logging
    function logEvent(name, details) {
      var msg = "dispatch-bmad-pr-develop " + name + ": " + JSON.stringify(details ?? {});
      context.diagnosticLog(msg);
    }

    // Resolve instructions
    function getStageConfig(repo, label) {
      var repoConfig = data.actionInstructionsByRepoLabel && data.actionInstructionsByRepoLabel[repo];
      if (!repoConfig || typeof repoConfig !== "object") return null;
      return repoConfig[normStr(label).trim().toLowerCase()] ?? null;
    }

    function resolveInstructions(repo, label) {
      var stageConfig = getStageConfig(repo, label);
      var lines = stageConfig.instructions;
      return lines.map(function(l) {
        var line = normStr(l).trim();
        if (!line) return "";
        if (line.slice(-1) !== ".") line += ".";
        return line + " ";
      }).filter(function(x) { return x; }).join("\n\n");
    }

    function resolveStageConfig(repo, label) {
      var labelKey = normStr(label).trim().toLowerCase();
      var stageConfig = data.actionInstructionsByRepoLabel[repo][labelKey];
      return {
        instructions: resolveInstructions(repo, labelKey),
        success_label: normStr(stageConfig.successLabel).trim(),
        ai: {
          provider: stageConfig.ai.provider,
          model: stageConfig.ai.model,
          reasoning_effort: stageConfig.ai.reasoningEffort,
          verbosity: stageConfig.ai.verbosity
        }
      };
    }

    function extractFieldFromText(text, fieldName) {
      var safeField = String(fieldName ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      var pattern = new RegExp("(?:^|\\s)" + safeField + "\\s*=\\s*([^\\s`]+)", "ig");
      var match;
      var found = "";
      var source = normStr(text);
      while ((match = pattern.exec(source)) !== null) {
        found = normStr(match[1]).trim();
      }
      return found;
    }

    function extractFieldFromComments(commentsList, fieldName) {
      var found = "";
      var list = Array.isArray(commentsList) ? commentsList : [];
      for (var i = 0; i < list.length; i += 1) {
        var next = extractFieldFromText(list[i]?.body, fieldName);
        if (next) found = next;
      }
      return found;
    }

    function extractLatestQuestion(commentsList) {
      var list = Array.isArray(commentsList) ? commentsList : [];
      var latest = "";
      var latestScore = -1;
      for (var i = list.length - 1; i >= 0; i -= 1) {
        var body = normStr(list[i]?.body).trim();
        var match = body.match(/^Question:\s*([\s\S]+)/i);
        if (match && normStr(match[1]).trim()) {
          var timestamp = Date.parse(normStr(list[i]?.updated_at ?? list[i]?.created_at));
          var score = isNaN(timestamp) ? i : timestamp;
          if (score >= latestScore) {
            latestScore = score;
            latest = normStr(match[1]).trim();
          }
        }
      }
      return latest;
    }

    function resolveSidecarRepositories(repo, branchValues) {
      var configs = data.sidecarRepositoriesByRepo?.[repo];
      if (!Array.isArray(configs) || configs.length === 0) return [];
      return configs.map(function(item) {
        var branchFrom = normStr(item?.branchFrom).trim();
        var branch = normStr(item?.branch ?? (branchFrom ? branchValues[branchFrom] : "")).trim();
        if (!branch) {
          throw new Error(branchFrom + " is required for sidecar repository " + normStr(item?.repo));
        }
        return {
          repo: normStr(item?.repo).trim(),
          path: normStr(item?.path).trim(),
          branch: branch,
          writable: item?.writable !== false,
          primary: item?.primary === true
        };
      });
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

    function emitDispatchFailure(pullNumber, errorCode, retryable) {
      var operation = normStr(payload.matched_label).trim().toLowerCase() === "pr review" ? "adversarial_review" : "pr_develop";
      context.sendToStepAndForget("emit-ai-developer-metric", JSON.stringify({
        operation: operation,
        stage: "dispatch",
        outcome: "failure",
        value: 1.0,
        metadata: {
          error: "true",
          repo: payload.repo,
          issue_or_pr: pullNumber,
          error_code: errorCode || "pr_develop_failed",
          retryable: retryable !== false
        }
      }));
    }

    function toLabelList(issueContext) {
      var labels = issueContext && Array.isArray(issueContext.labels) ? issueContext.labels : [];
      var out = [];
      for (var i = 0; i < labels.length; i += 1) out.push(normStr(labels[i]?.name ?? labels[i]).trim());
      out = out.filter(function(x) { return !!x; });
      return out;
    }

    function hasLabel(issueContext, labelName) {
      var target = normStr(labelName).trim().toLowerCase();
      return toLabelList(issueContext).some(function(label) {
        return label.toLowerCase() === target;
      });
    }

    function buildPrReviewRecoveryLabels(issueContext, matched, roleLabel) {
      var labels = toLabelList(issueContext);
      var matchedLower = normStr(matched).trim().toLowerCase();
      var roleLower = normStr(roleLabel).trim().toLowerCase();
      var out = [];
      var seen = {};
      labels.forEach(function(label) {
        var lower = label.toLowerCase();
        if (lower === "in progress" || lower === matchedLower || lower === "pr review") return;
        if (!seen[lower]) {
          seen[lower] = true;
          out.push(label);
        }
      });
      if (roleLower && !seen[roleLower]) out.push(roleLabel);
      if (!seen["pr review"]) out.push("pr review");
      return out;
    }

    function commentAuthor(comment) {
      return normStr(comment?.user?.login ?? comment?.author?.login ?? comment?.author).trim();
    }

    function getAssignmentTarget(commentsList, prObject, fallbackContext) {
      var list = Array.isArray(commentsList) ? commentsList : [];
      for (var i = list.length - 1; i >= 0; i -= 1) {
        var author = commentAuthor(list[i]);
        if (author && normStr(list[i]?.body).indexOf("<!-- OPSCOTCH_AI_DEVELOPER_OPERATIONAL -->") < 0) return author;
      }
      return normStr(fallbackContext?.user?.login ?? prObject?.requested_reviewers?.[0]?.login ?? "").trim();
    }

    function applyPrReviewRecoveryLabels(pullNumber, matchedLabel, roleLabel) {
      var response = context.sendToStep("consume-ai-action-trigger", JSON.stringify({
        repo: payload.repo,
        issue: pullNumber,
        matched_label: matchedLabel,
        issue_context: makeIssueContext(),
        updater_deployment_access_id: updaterDeploymentAccessId,
        updater_step_id: updaterStepId,
        outcome_label: "pr review"
      }));
      parseStepBodyStrict(response, "consume-ai-action-trigger");
    }

    function rejectSecondaryPr(pullNumber, prObject, matchedLabel) {
      var requestedOperation = normStr(payload.operation).trim().toLowerCase() === "question" || normStr(matchedLabel).trim().toLowerCase() === "question"
        ? "question"
        : "AI PR update";
      callUpdater({
        operation: "add-comment",
        repo: payload.repo,
        issue: pullNumber,
        comment: requestedOperation + " was not started.\n\n" +
          "- status: rejected\n" +
          "- error_code: secondary_pr_not_control_pr\n" +
          "- error_message: This PR is labelled `secondary-pr`. Trigger AI iteration from the linked `primary-pr` instead.\n\n" +
          "Leave review comments here if needed, then assign the `primary-pr` to the AI user with the active workflow label. The primary PR run will pull and update all linked implementation branches."
      });
      applyPrReviewRecoveryLabels(pullNumber, matchedLabel, "secondary-pr");
      emitDispatchFailure(pullNumber, "secondary_pr_not_control_pr", false);
      context.setBody(JSON.stringify({
        status: "error",
        operation: "reject-secondary-pr",
        repo: payload.repo,
        pull_number: pullNumber,
        matched_label: matchedLabel,
        error: {
          code: "secondary_pr_not_control_pr",
          message: "secondary-pr must be iterated from the linked primary-pr"
        }
      }));
    }

    function recoverPrReview(pullNumber, roleLabel, matchedLabel, message, commentsList, prObject) {
      callUpdater({
        operation: "add-comment",
        repo: payload.repo,
        issue: pullNumber,
        comment: message
      });
      applyPrReviewRecoveryLabels(pullNumber, matchedLabel, roleLabel);
    }

    function roleLabelForCurrentPr(issueContext) {
      if (hasLabel(issueContext, "primary-pr")) return "primary-pr";
      if (hasLabel(issueContext, "secondary-pr")) return "secondary-pr";
      return "";
    }

    function classifyNotStartedError(message) {
      var text = normStr(message);
      if (text.indexOf("is required for sidecar repository") >= 0) return "missing_repository_branch";
      if (text.indexOf("work_branch is required for linked sidecar repository") >= 0) return "missing_linked_pr_metadata";
      if (text.indexOf("base_branch is required") >= 0) return "missing_base_branch";
      if (text.indexOf("work_branch is required") >= 0) return "missing_work_branch";
      if (text.indexOf("instructions are required") >= 0) return "missing_instructions";
      return "pr_update_not_started";
    }

    function recoverNotStarted(pullNumber, matchedLabel, message, commentsList, prObject, guidance) {
      var issueContext = makeIssueContext();
      var roleLabel = roleLabelForCurrentPr(issueContext);
      var errMsg = normStr(message || "unknown error");
      var errorCode = classifyNotStartedError(errMsg);
      var help = normStr(guidance);
      recoverPrReview(
        pullNumber,
        roleLabel,
        matchedLabel,
        "AI PR update was not started.\n\n" +
          "- status: failed\n" +
          "- error_code: " + errorCode + "\n" +
          "- error_message: " + errMsg +
          (help ? "\n\n" + help : ""),
        commentsList,
        prObject
      );
      emitDispatchFailure(pullNumber, errorCode, true);
      context.setBody(JSON.stringify({
        status: "error",
        operation: "recover-pr-review",
        repo: payload.repo,
        pull_number: pullNumber,
        error: { code: errorCode, message: errMsg, retryable: true }
      }));
    }

    function parseLinkedPrRefsFromText(text) {
      var out = [];
      var source = normStr(text);
      var re = /([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)#(\d+)\s+on\s+`([^`]+)`/g;
      var match;
      while ((match = re.exec(source)) !== null) {
        out.push({
          repo: normStr(match[1]).trim(),
          pull_number: parsePositiveInt(match[2]),
          work_branch: normStr(match[3]).trim()
        });
      }
      var lines = source.split(/\r?\n/);
      var plainBulletRe = /^\s*[-*]\s+([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)#(\d+)\b/;
      for (var i = 0; i < lines.length; i += 1) {
        var plain = lines[i].match(plainBulletRe);
        if (!plain) continue;
        out.push({
          repo: normStr(plain[1]).trim(),
          pull_number: parsePositiveInt(plain[2]),
          work_branch: ""
        });
      }
      return out.filter(function(ref) { return ref.repo && ref.pull_number > 0; });
    }

    function parseLinkedPrRefs(texts) {
      var out = [];
      var seen = {};
      for (var i = 0; i < texts.length; i += 1) {
        var refs = parseLinkedPrRefsFromText(texts[i]);
        for (var j = 0; j < refs.length; j += 1) {
          var key = refs[j].repo + "#" + refs[j].pull_number;
          if (!seen[key]) {
            seen[key] = true;
            out.push(refs[j]);
          } else if (refs[j].work_branch) {
            for (var k = 0; k < out.length; k += 1) {
              if (out[k].repo + "#" + out[k].pull_number === key) out[k].work_branch = refs[j].work_branch;
            }
          }
        }
      }
      return out;
    }

    function fetchPrDetails(repoRef, pullNum, fallbackPr) {
      var prResp = context.sendToStep("github-pr-get-details", JSON.stringify({ repo: repoRef, pull_number: pullNum }));
      var prBody = JSON.parse(prResp?.getBody() ?? "{}");
      if ((prBody.status ?? "").toLowerCase() !== "ok") {
        throw new Error("github-pr-get-details failed for " + repoRef + "#" + pullNum);
      }
      return {
        repo: repoRef,
        pull_number: pullNum,
        raw: prBody.raw ?? fallbackPr ?? {},
        title: normStr(prBody.title),
        body: normStr(prBody.body),
        base_branch: normStr(prBody.base_branch),
        work_branch: normStr(prBody.head_branch)
      };
    }

    function fetchPrComments(repoRef, pullNum) {
      function fetchByType(entityType) {
        var resp = context.sendToStep("fetch-linked-pr-comments", JSON.stringify({
          repo: repoRef,
          issue: pullNum,
          pull_number: pullNum,
          entity_type: entityType
        }));
        var body = parseStepBodyStrict(resp, "fetch-linked-pr-comments");
        return Array.isArray(body.comments) ? body.comments : [];
      }

      var comments = fetchByType("issue").concat(fetchByType("pr"));
      var out = [];
      var seen = {};
      for (var i = 0; i < comments.length; i += 1) {
        var c = comments[i] || {};
        var key = c.id !== undefined && c.id !== null
          ? "id:" + String(c.id)
          : c.node_id
            ? "node_id:" + String(c.node_id)
            : "body:" + String(c.body || "") + "|created_at:" + String(c.created_at || "");
        if (seen[key]) continue;
        seen[key] = true;
        out.push(c);
      }
      return out;
    }

    function linkedPrTextSources(primaryPr, commentsList) {
      var texts = [
        payload.issue_body,
        payload.pr_body,
        primaryPr?.body
      ];
      var list = Array.isArray(commentsList) ? commentsList : [];
      for (var i = 0; i < list.length; i += 1) texts.push(list[i]?.body);
      return texts;
    }

    function discoverLinkedPrs(repoRef, pullNum, primaryPr, currentComments) {
      var refs = parseLinkedPrRefs(linkedPrTextSources(primaryPr, currentComments));
      var currentKey = repoRef + "#" + pullNum;
      var hasCurrent = refs.some(function(ref) { return ref.repo + "#" + ref.pull_number === currentKey; });
      if (!hasCurrent) refs.unshift({ repo: repoRef, pull_number: pullNum, work_branch: "" });
      var details = [];
      for (var i = 0; i < refs.length; i += 1) {
        var ref = refs[i];
        var detail = fetchPrDetails(ref.repo, ref.pull_number, ref.repo === repoRef && ref.pull_number === pullNum ? primaryPr : {});
        if (ref.work_branch && !detail.work_branch) detail.work_branch = ref.work_branch;
        details.push(detail);
      }
      return details;
    }

    function resolveSidecarRepositoriesForPr(repoRef, branchValues, linkedPrs) {
      var configs = data.sidecarRepositoriesByRepo?.[repoRef];
      if (!Array.isArray(configs) || configs.length === 0) return [];
      return configs.map(function(item) {
        var itemRepo = normStr(item?.repo).trim();
        var linked = Array.isArray(linkedPrs) ? linkedPrs.find(function(prItem) { return prItem.repo === itemRepo; }) : null;
        var branchFrom = normStr(item?.branchFrom).trim();
        var branch = normStr(linked?.base_branch ?? item?.branch ?? (branchFrom ? branchValues[branchFrom] : "")).trim();
        var work = normStr(linked?.work_branch).trim();
        if (!branch) {
          throw new Error(branchFrom + " is required for sidecar repository " + itemRepo);
        }
        // Secondary linked PRs are optional: a writable sidecar repo may correctly have
        // no implementation PR when that repository was unchanged. Only require
        // work_branch when a linked PR for this specific repo was discovered.
        if (linked && item?.writable !== false && !work) {
          throw new Error("work_branch is required for linked sidecar repository " + itemRepo);
        }
        return {
          repo: itemRepo,
          path: normStr(item?.path).trim(),
          branch: branch,
          work_branch: work,
          pull_number: linked?.pull_number,
          writable: item?.writable !== false,
          primary: item?.primary === true
        };
      });
    }

    // Set in-progress label
    function setInProgress(pullNumber, issueContext, matched) {
      var labelResp = context.sendToStep("compute-pr-labels", JSON.stringify({
        operation: "to-in-progress",
        matched_label: matched,
        labels: toLabelList(issueContext)
      }));
      var labelBody = parseStepBodyStrict(labelResp, "compute-pr-labels");
      if ((labelBody.status ?? "").toLowerCase() !== "ok" || !Array.isArray(labelBody.labels)) {
        throw new Error("compute-pr-labels returned invalid response");
      }
      callUpdater({
        operation: "update-issue",
        repo: payload.repo,
        issue: pullNumber,
        labels: labelBody.labels
      });
    }

    // Set PR review label
    function setPrReview(pullNumber, issueContext) {
      var labelResp = context.sendToStep("compute-pr-labels", JSON.stringify({
        operation: "to-pr-review",
        labels: toLabelList(issueContext)
      }));
      var labelBody = parseStepBodyStrict(labelResp, "compute-pr-labels");
      if ((labelBody.status ?? "").toLowerCase() !== "ok" || !Array.isArray(labelBody.labels)) {
        throw new Error("compute-pr-labels returned invalid response");
      }
      callUpdater({
        operation: "update-issue",
        repo: payload.repo,
        issue: pullNumber,
        labels: labelBody.labels
      });
    }

    function parsePositiveInt(value) {
      var n = parseInt(value, 10);
      return !isNaN(n) && n > 0 ? n : 0;
    }

    function extractSourceIssueFromPrBody(prBodyText) {
      var text = normStr(prBodyText);
      if (!text) return 0;
      var m = text.match(/(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/i);
      if (!m) return 0;
      return parsePositiveInt(m[1]);
    }

    function stripLeadingIssuePrefixes(title) {
      var rest = normStr(title).trim();
      while (true) {
        var m = rest.match(/^Issue\s+\d+:\s*/i);
        if (!m) break;
        rest = rest.slice(m[0].length);
      }
      return rest.trim();
    }

    // Extract values
    var updaterDeploymentAccessId = normStr(data.issueUpdaterDeploymentAccessId);
    var updaterStepId = normStr(data.issueUpdaterStepId);
    var pr = payload.pull_context ?? payload.pr_context ?? payload.issue_context ?? {};
    var pullNumber = parseInt(payload.pull_number, 10);
    if (isNaN(pullNumber) || pullNumber <= 0) throw new Error("pull_number must be a positive integer");
    var repo = payload.repo;
    var matchedLabel = normStr(payload.matched_label).trim();

    if (!getStageConfig(repo, matchedLabel)) {
      logEvent("unmatched-label-noop", {
        repo: repo,
        pull_number: pullNumber,
        matched_label: matchedLabel
      });
      context.setBody(JSON.stringify({
        status: "ok",
        operation: "noop",
        repo: repo,
        pull_number: pullNumber,
        matched_label: matchedLabel,
        reason: "unmatched-label"
      }));
      return;
    }

    // Get PR details
    try {
      var prResp = context.sendToStep("github-pr-get-details", JSON.stringify({ repo: repo, pull_number: pullNumber }));
      var prBody = JSON.parse(prResp?.getBody() ?? "{}");
      if ((prBody.status ?? "").toLowerCase() === "ok") {
        pr = prBody.raw ?? pr;
        logEvent("pr-details", { repo: repo, pull_number: pullNumber, base_branch: prBody?.base_branch, head_branch: prBody?.head_branch });
      }
    } catch (e) {
      logEvent("pr-details-failed", { repo: repo, pull_number: pullNumber, error: String(e?.message ?? e) });
    }

    // Extract branches
    var baseBranch = normStr(pr?.base?.ref ?? payload.base_branch);
    var workBranch = normStr(pr?.head?.ref ?? payload.work_branch);
    if (!baseBranch) {
      recoverNotStarted(pullNumber, payload.matched_label, "base_branch is required for PR develop dispatch", payload.comments ?? payload.pr_comments, pr);
      return;
    }
    if (!workBranch) {
      recoverNotStarted(pullNumber, payload.matched_label, "work_branch is required for PR develop dispatch", payload.comments ?? payload.pr_comments, pr);
      return;
    }
    var communityBranch = normStr(payload.community_branch).trim() ||
      extractFieldFromText(payload.issue_body ?? payload.pr_body ?? pr?.body, "community_branch") ||
      extractFieldFromComments(payload.comments ?? payload.pr_comments, "community_branch");

    // Resolve instructions
    var requestedOperation = normStr(payload.operation).trim().toLowerCase() === "question" || matchedLabel.trim().toLowerCase() === "question"
      ? "question"
      : "develop";
    var issueContext = makeIssueContext();
    if (hasLabel(issueContext, "secondary-pr")) {
      rejectSecondaryPr(pullNumber, pr, matchedLabel);
      return;
    }

    var stageConfig = resolveStageConfig(repo, matchedLabel);
    var instructions = stageConfig.instructions;
    var ai = stageConfig.ai;

    // Normalize comments
    var rawCurrentComments = payload.comments ?? payload.pr_comments;
    var linkedPrs = [];
    var allRawComments = Array.isArray(rawCurrentComments) ? rawCurrentComments.slice() : [];
    var commentsByLinkedPr = {};
    var isPrimaryPr = hasLabel(issueContext, "primary-pr");
    var repositories;
    try {
      if (isPrimaryPr) {
        linkedPrs = discoverLinkedPrs(repo, pullNumber, pr, rawCurrentComments);
        for (var linkedIndex = 0; linkedIndex < linkedPrs.length; linkedIndex += 1) {
          var linked = linkedPrs[linkedIndex];
          var linkedKey = linked.repo + "#" + linked.pull_number;
          try {
            var linkedComments = fetchPrComments(linked.repo, linked.pull_number);
            commentsByLinkedPr[linkedKey] = linkedComments;
            allRawComments = allRawComments.concat(linkedComments);
          } catch (commentError) {
            logEvent("linked-pr-comments-failed", {
              repo: linked.repo,
              pull_number: linked.pull_number,
              error: String(commentError?.message ?? commentError)
            });
          }
        }
        repositories = resolveSidecarRepositoriesForPr(repo, {
          base_branch: baseBranch,
          community_branch: communityBranch
        }, linkedPrs);
      } else {
        repositories = resolveSidecarRepositories(repo, {
          base_branch: baseBranch,
          community_branch: communityBranch
        });
      }
    } catch (e) {
      var errMsg = normStr(e?.message ?? e);
      recoverNotStarted(
        pullNumber,
        matchedLabel,
        errMsg,
        allRawComments,
        pr,
        errMsg.indexOf("is required for sidecar repository") >= 0
          ? "Add the missing branch to the PR body or a PR comment, for example:\n\n`community_branch=main`"
          : "Restore the linked implementation PR metadata, then assign the `primary-pr` to the AI user with the active workflow label."
      );
      return;
    }

    var normalizedComments = [];
    var commentCountsByPr = {};
    if (isPrimaryPr && linkedPrs.length > 0) {
      for (var normalizedIndex = 0; normalizedIndex < linkedPrs.length; normalizedIndex += 1) {
        var currentLinked = linkedPrs[normalizedIndex];
        var currentKey = currentLinked.repo + "#" + currentLinked.pull_number;
        var commentSource = commentsByLinkedPr[currentKey];
        if (!Array.isArray(commentSource) && currentLinked.repo === repo && currentLinked.pull_number === pullNumber) {
          commentSource = rawCurrentComments;
        }
        var normalizedForPr = normalizeComments(commentSource, currentLinked.repo, currentLinked.pull_number);
        commentCountsByPr[currentKey] = normalizedForPr.length;
        normalizedComments = normalizedComments.concat(normalizedForPr);
      }
    } else {
      normalizedComments = normalizeComments(rawCurrentComments);
      commentCountsByPr[repo + "#" + pullNumber] = normalizedComments.length;
    }

    if (requestedOperation === "question") {
      var latestQuestion = extractLatestQuestion(normalizedComments);
      if (!latestQuestion) {
        recoverPrReview(
          pullNumber,
          isPrimaryPr ? "primary-pr" : "",
          matchedLabel,
          "AI question was not started.\n\n" +
            "- status: failed\n" +
            "- error_code: missing_question_comment\n" +
            "- error_message: Add a PR comment starting with `Question:` before applying the `question` label.",
          allRawComments,
          pr
        );
        emitDispatchFailure(pullNumber, "missing_question_comment", true);
        context.setBody(JSON.stringify({
          status: "error",
          operation: "recover-pr-review",
          repo: repo,
          pull_number: pullNumber,
          error: { code: "missing_question_comment", message: "Question: comment is required", retryable: true }
        }));
        return;
      }
      instructions = [
        "Answer the latest PR question without changing code.",
        "Do not edit files, commit, push, create PRs, or update PR bodies.",
        "Use the checked-out linked repositories and all PR comments as context.",
        "If the answer depends on an assumption, state the assumption briefly.",
        "Return a direct answer that can be posted as a PR comment.",
        "",
        "Question:",
        latestQuestion
      ].join("\n");
    }

    logEvent("resolved-config", {
      repo: repo,
      pull_number: pullNumber,
      matched_label: matchedLabel,
      base_branch: baseBranch,
      work_branch: workBranch,
      repositories: repositories.map(function(item) {
        return {
          repo: item.repo,
          branch: item.branch,
          work_branch: item.work_branch,
          primary: item.primary
        };
      }),
      linked_prs: linkedPrs.map(function(item) { return item.repo + "#" + item.pull_number; }),
      comment_counts_by_pr: commentCountsByPr
    });

    var explicitIssue = parsePositiveInt(payload.issue);
    var sourceIssueFromPr = extractSourceIssueFromPrBody(pr?.body ?? payload.pr_body ?? payload.issue_body ?? "");
    var issueNumber = explicitIssue || sourceIssueFromPr || pullNumber;
    var canonicalTitleSuffix = stripLeadingIssuePrefixes(payload.title ?? pr?.title ?? "");
    var canonicalTitle = canonicalTitleSuffix ? ("Issue " + issueNumber + ": " + canonicalTitleSuffix) : ("Issue " + issueNumber);
    var requestId = createUuid();
    var idempotencyKey = repo + ":" + issueNumber + ":" + normStr(payload.updated_at);
    var runId = createUuid();
    var startedAt = new Date(context.getTimestamp()).toISOString();

    var invokeState = {
      operation: requestedOperation,
      repo: repo,
      issue: pullNumber,
      source_issue: issueNumber,
      pull_number: pullNumber,
      request_id: requestId,
      idempotency_key: idempotencyKey,
      queue_idempotency_key: idempotencyKey + ":" + requestedOperation,
      run_id: runId,
      started_at: startedAt,
      base_branch: baseBranch,
      work_branch: workBranch,
      repositories: repositories,
      instructions: instructions,
      success_label: stageConfig.success_label,
      ai: ai,
      workflow: requestedOperation === "question" ? "quick-spec" : (payload.workflow ?? "quick-spec"),
      updater_deployment_access_id: updaterDeploymentAccessId,
      updater_step_id: updaterStepId,
      condition_assignee: normStr(payload.assignee).trim(),
      payload: {
        updated_at: payload.updated_at ?? startedAt,
        title: canonicalTitle,
        issue_body: payload.issue_body ?? payload.pr_body ?? "",
        comments: normalizedComments,
        issue_context: payload.issue_context ?? pr,
        matched_label: matchedLabel,
        omit_comment_users: [],
        ai: ai
      }
    };

    logEvent("resolved-source-issue", {
      repo: repo,
      pull_number: pullNumber,
      explicit_issue: explicitIssue || null,
      pr_body_issue: sourceIssueFromPr || null,
      issue: issueNumber,
      title: canonicalTitle
    });

    logEvent("dispatch-bmad-pr-develop-invoke", {
      repo: repo,
      pull_number: pullNumber,
      issue: issueNumber,
      request_id: requestId,
      base_branch: baseBranch,
      work_branch: workBranch,
      comments_count: normalizedComments.length
    });

    var response;
    try {
      response = context.sendToStep("dispatch-bmad-pr-develop-invoke", JSON.stringify(invokeState));
    } catch (e) {
      recoverNotStarted(pullNumber, matchedLabel, String(e?.message ?? e), normalizedComments, pr);
      return;
    }
    if (response.isErrored()) {
      var stepErrors = [];
      try {
        stepErrors = response.getAllErrors() ?? [];
      } catch (e) { /* ignore */ }
      var errMessage = "dispatch-bmad-pr-develop-invoke step errored";
      try {
        var first = String(response.getFirstError(stepErrors) ?? "");
        if (first) errMessage = first;
      } catch (e) { /* ignore */ }
      if (errMessage === "dispatch-bmad-pr-develop-invoke step errored" && stepErrors.length > 0) {
        errMessage = String(stepErrors[0] ?? errMessage);
      }
      recoverNotStarted(pullNumber, matchedLabel, errMessage, normalizedComments, pr);
      return;
    }

    function isLimited(body) {
      var code = (body?.error?.code ?? "").toLowerCase();
      if (code === "rate_limited") return true;
      var sc = String(body?.status_code ?? "");
      if (sc === "429") return true;
      var message = (body?.error?.message ?? "").toLowerCase();
      return message.includes("429") || message.includes("rate limit");
    }

    var body = JSON.parse(response?.getBody() ?? "{}");
    logEvent("dispatch-bmad-pr-develop-invoke-response", {
      repo: repo,
      pull_number: pullNumber,
      request_id: requestId,
      queued: body?.queued,
      status: body?.status,
      has_error: !!body?.error
    });

    if (isLimited(body)) {
      context.setBody(JSON.stringify(body));
      return;
    }
    if ((body.status ?? "").toLowerCase() === "error" || body.error) {
      recoverNotStarted(pullNumber, matchedLabel, body.error?.message || "PR sidecar invoke failed", normalizedComments, pr);
      return;
    }

    // Only announce the task after the sidecar has accepted it. The
    // operational comment is intentionally retained as history.
    try {
      callUpdater({
        operation: "add-comment",
        repo: repo,
        issue: pullNumber,
        comment: (requestedOperation === "question" ? "PR question started by CLI sidecar developer." : "PR update started by CLI sidecar developer.") +
          "\n\n- status: started\n- operation: " + requestedOperation + "\n- base_branch: " + baseBranch + "\n- work_branch: " + workBranch + "\n\n<!-- OPSCOTCH_AI_DEVELOPER_OPERATIONAL -->"
      }, "add-comment");
      logEvent("start-comment", { repo: repo, pull_number: pullNumber });
    } catch (e) {
      logEvent("start-comment-failed", { repo: repo, pull_number: pullNumber, error: String(e?.message ?? e) });
      recoverNotStarted(pullNumber, matchedLabel, String(e?.message ?? e), normalizedComments, pr);
      return;
    }

    try {
      setInProgress(pullNumber, payload.issue_context, matchedLabel);
      logEvent("in-progress-label-set", { repo: repo, pull_number: pullNumber });
    } catch (e) {
      logEvent("in-progress-label-set-failed", { repo: repo, pull_number: pullNumber, error: String(e?.message ?? e) });
      recoverNotStarted(pullNumber, matchedLabel, String(e?.message ?? e), normalizedComments, pr);
      return;
    }

    context.setBody(JSON.stringify(body));
  });
