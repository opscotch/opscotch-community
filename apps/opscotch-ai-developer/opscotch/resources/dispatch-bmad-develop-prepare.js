doc
  .description("Prepare and validate develop dispatch payload")
  .asUserErrors()
  .inSchema({
    type: "object",
    required: [
      "repo",
      "issue",
      "updated_at",
      "title",
      "issue_body",
      "comments",
      "issue_context",
      "matched_label"
    ],
    additionalProperties: true,
    properties: {
      repo: { type: "string", minLength: 3, pattern: "^[^/]+\\/[^/]+$", description: "Repository in owner/repo format" },
      issue: { oneOf: [{ type: "number", minimum: 1 }, { type: "string", pattern: "^[1-9][0-9]*$" }], description: "Issue number or string" },
      updated_at: { type: "string", minLength: 1, description: "Update timestamp" },
      title: { type: "string", minLength: 1, description: "Issue title" },
      issue_body: { type: ["string", "null"], description: "Issue body; GitHub returns null when empty" },
      comments: { type: "array", items: { type: "object", additionalProperties: true }, description: "Issue comments" },
      issue_context: { type: "object", description: "Issue context metadata" },
      matched_label: { type: "string", minLength: 1, description: "Matched label for routing" },
      workflow: { type: "string", description: "Override workflow" },
      work_branch: { type: "string", description: "Override work branch" },
      base_branch: { type: "string", description: "Override base branch" }
    }
  })
  .dataSchema({
    type: "object",
    required: [
      "issueUpdaterDeploymentAccessId",
      "issueUpdaterStepId",
      "actionInstructionsByRepoLabel",
      "developWorkflow",
      "developWorkBranchPrefix"
    ],
    additionalProperties: true,
    properties: {
      issueUpdaterDeploymentAccessId: { type: "string", minLength: 1, description: "Deployment access id for updates" },
      issueUpdaterStepId: { type: "string", minLength: 1, description: "Step ID for updates" },
      developWorkflow: { type: "string", minLength: 1, description: "Default workflow name" },
      developWorkBranchPrefix: { type: "string", minLength: 1, description: "Prefix for work branch" },
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
      }
    }
  })
  .outSchema({
    type: "object",
    properties: {
      payload: { type: "object", description: "Processed payload" },
      request_id: { type: "string", description: "Generated request ID" }
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
        if (c === "x") return r.toString(16);
        return (r & 0x3 | 0x8).toString(16);
      });
    }

    function normalizeIssueNum(value) {
      var num = parseInt(value, 10);
      if (isNaN(num) || num <= 0) throw new Error("issue must be a positive integer");
      return num;
    }

    function resolveInstructions(repo, label) {
      var lines = data.actionInstructionsByRepoLabel[repo][label.toLowerCase()].instructions;
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

    function buildBranch(prefix, issue, updated) {
      var safe = normStr(prefix).trim();
      if (!safe) throw new Error("developWorkBranchPrefix is required");
      var ts = normStr(updated).replace(/[^0-9]/g, "").slice(0, 14);
      return safe + issue + (ts ? "-" + ts : "");
    }

    function emitStatus(event) {
      try {
        context.sendToStepAndForget("track-bmad-develop-status", JSON.stringify(event));
      } catch (e) { /* ignore */ }
    }

    // Parse already done above
    var issue = normalizeIssueNum(payload.issue);
    var repo = payload.repo;
    var updatedAt = payload.updated_at;
    var workflow = normStr(data.developWorkflow).trim();
    var requestId = createUuid();
    var idempotencyKey = repo + ":" + issue + ":" + updatedAt;
    var queueIdempotencyKey = String(payload._queue?.idempotency_key ?? "").trim() || (idempotencyKey + ":develop");
    var runId = String(payload._queue?.run_id ?? "").trim() || requestId;
    var startedAt = new Date(context.getTimestamp()).toISOString();

    var baseBranch = "";
    var workBranch = "";
    var communityBranch = "";
    var prCtx = payload.pull_context;
    var entityType = payload.entity_type;
    if (entityType === "pr" || (prCtx && (prCtx.base || prCtx.head))) {
      baseBranch = normStr(prCtx?.base?.ref).trim();
      workBranch = normStr(prCtx?.head?.ref).trim();
      if (!baseBranch || !workBranch) {
        throw new Error("pull_context.base.ref and pull_context.head.ref are required for PR develop dispatch");
      }
    } else {
      var baseResp = context.sendToStep("extract-base-branch", JSON.stringify({
        issue_body: payload.issue_body,
        comments: payload.comments,
        base_branch: payload.base_branch ?? ""
      }));
      if (baseResp.isErrored()) {
        throw new Error("extract-base-branch step errored");
      }
      var baseBody = JSON.parse(baseResp?.getBody() ?? "{}");
      baseBranch = normStr(baseBody?.base_branch ?? payload.base_branch).trim();
      if (!baseBranch) throw new Error("base_branch is required");
      workBranch = normStr(payload.work_branch).trim() || buildBranch(data.developWorkBranchPrefix, issue, updatedAt);
    }
    communityBranch = normStr(payload.community_branch).trim() ||
      extractFieldFromText(payload.issue_body, "community_branch") ||
      extractFieldFromComments(payload.comments, "community_branch");

    var stageConfig = resolveStageConfig(repo, payload.matched_label);
    var instructions = stageConfig.instructions;
    var ai = stageConfig.ai;

    var repositories = resolveSidecarRepositories(repo, {
      base_branch: baseBranch,
      community_branch: communityBranch
    });

    emitStatus({
      operation: "update",
      idempotency_key: queueIdempotencyKey || (idempotencyKey + ":develop"),
      run_id: runId,
      repo: repo,
      issue: issue,
      status: "running",
      request_id: requestId,
      started_at: startedAt
    });

    payload.workflow = workflow;
    payload.ai = ai;
    payload.work_branch = workBranch;

    context.setBody(JSON.stringify({
      payload: payload,
      data: data,
      repo: repo,
      issue: issue,
      request_id: requestId,
      idempotency_key: idempotencyKey,
      queue_idempotency_key: queueIdempotencyKey,
      run_id: runId,
      started_at: startedAt,
      workflow: workflow,
      ai: ai,
      base_branch: baseBranch,
      work_branch: workBranch,
      repositories: repositories,
      instructions: instructions,
      success_label: stageConfig.success_label,
      updater_deployment_access_id: data.issueUpdaterDeploymentAccessId,
      updater_step_id: data.issueUpdaterStepId
    }));
  });
