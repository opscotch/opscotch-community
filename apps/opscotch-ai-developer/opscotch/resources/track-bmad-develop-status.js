doc
  .description("Track and query develop task statuses")
  .inSchema({
    type: "object",
    properties: {
      operation: { type: "string", description: "Operation: update, snapshot, reserve-dispatch, release-dispatch" },
      idempotency_key: { type: "string", description: "Idempotency key" },
      repo: { type: "string", description: "Repository" },
      issue: { oneOf: [{ type: "number" }, { type: "string" }], description: "Issue number" },
      run_id: { type: "string", description: "Run ID" },
      status: { type: "string", description: "Status" },
      request_id: { type: "string", description: "Request ID" },
      retryable: { type: "boolean", description: "Whether retryable" },
      error_code: { type: "string", description: "Error code" },
      error_message: { type: "string", description: "Error message" },
      error: { type: "string", description: "Set to \"true\" when this update records a failure, for metric filtering." },
      duration_ms: { type: "number", description: "Duration in ms" },
      attempt: { type: "number", description: "Attempt number" },
      started_at: { type: "string", description: "Start timestamp" },
      dispatched_at: { type: "string", description: "Dispatch timestamp" },
      completed_at: { type: "string", description: "Completion timestamp" }
    }
  })
  .outSchema({
    type: "object",
    properties: {
      status: { type: "string", description: "Status" },
      summary: { type: "object", description: "Task summary" },
      task: { type: "object", description: "Task details" }
    }
  })
  .run(() => {

    var TASKS_KEY = "cli-sidecar:develop:tasks";
    var ISSUE_STATE_KEY = "cli-sidecar:develop:issue-state";
    var LOG_PREFIX = "track-bmad-develop-status";

    function log(event, details) {
      var payload = details && typeof details === "object" ? details : {};
      var line = LOG_PREFIX + " " + event + " " + JSON.stringify(payload);
      context.diagnosticLog(line);
    }

    function getTasks() {
      var raw = context.getPersistedItem(TASKS_KEY);
      if (raw === null || raw === undefined || raw === "") {
        return {};
      }
      try {
        var parsed = JSON.parse(String(raw));
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          log("tasks.non_object_reset", { type: typeof parsed });
          return {};
        }
        return parsed;
      } catch (err) {
        log("tasks.parse_failed_reset", {
          error: String(err && err.message ? err.message : err),
          raw_length: String(raw).length,
          raw_preview: String(raw).slice(0, 180)
        });
        return {};
      }
    }

    function setTasks(tasks) {
      context.setPersistedItem(TASKS_KEY, JSON.stringify(tasks));
    }

    function getIssueState() {
      var raw = context.getPersistedItem(ISSUE_STATE_KEY);
      if (raw === null || raw === undefined || raw === "") {
        return {};
      }
      try {
        var parsed = JSON.parse(String(raw));
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          log("issue_state.non_object_reset", { type: typeof parsed });
          return {};
        }
        return parsed;
      } catch (err) {
        log("issue_state.parse_failed_reset", {
          error: String(err && err.message ? err.message : err),
          raw_length: String(raw).length,
          raw_preview: String(raw).slice(0, 180)
        });
        return {};
      }
    }

    function setIssueState(state) {
      context.setPersistedItem(ISSUE_STATE_KEY, JSON.stringify(state));
    }

    function toIso(ts) {
      return new Date(ts).toISOString();
    }

    function summarize(tasks) {
      var keys = Object.keys(tasks);
      var summary = {
        total: keys.length,
        queued: 0,
        running: 0,
        dispatched: 0,
        succeeded: 0,
        failed: 0,
        unknown: 0,
        running_tasks: []
      };
      var now = context.getTimestamp();

      for (var i = 0; i < keys.length; i += 1) {
        var task = tasks[keys[i]] ?? {};
        var status = String(task.status ?? "unknown");
        if (summary[status] !== undefined) summary[status] += 1;
        else summary.unknown += 1;

        if (status === "running" || status === "dispatched") {
          var startedMs = Date.parse(String(task.started_at ?? task.dispatched_at ?? ""));
          summary.running_tasks.push({
            idempotency_key: keys[i],
            run_id: String(task.run_id ?? ""),
            repo: String(task.repo ?? ""),
            issue: task.issue,
            status: status,
            started_at: String(task.started_at ?? task.dispatched_at ?? ""),
            duration_ms: isNaN(startedMs) ? null : Math.max(0, now - startedMs)
          });
        }
      }

      return summary;
    }

    function issueKey(repo, issue) {
      return String(repo ?? "") + "#" + String(issue ?? "");
    }

    function isActiveStatus(status) {
      return status === "reserved" || status === "queued" || status === "running" || status === "dispatched";
    }

    function activeStatusTimeoutMs(status) {
      if (status === "reserved") return 5 * 60 * 1000;
      if (status === "queued") return 15 * 60 * 1000;
      if (status === "running" || status === "dispatched") return 30 * 60 * 1000;
      return 0;
    }

    function isStaleActiveState(state) {
      if (!state || typeof state !== "object") return false;
      var status = String(state.status ?? "");
      if (!isActiveStatus(status)) return false;
      var timeoutMs = activeStatusTimeoutMs(status);
      if (timeoutMs <= 0) return false;
      var updatedAt = Date.parse(String(state.updated_at ?? state.started_at ?? state.dispatched_at ?? ""));
      if (isNaN(updatedAt)) return true;
      return Math.max(0, context.getTimestamp() - updatedAt) > timeoutMs;
    }

    var bodyRaw = context.getBody();
    var body;
    try {
      body = JSON.parse(bodyRaw);
    } catch (err) {
      log("body.parse_failed", {
        error: String(err && err.message ? err.message : err),
        raw_length: String(bodyRaw ?? "").length,
        raw_preview: String(bodyRaw ?? "").slice(0, 180)
      });
      body = {};
    }
    var op = String(body.operation ?? "update");
    var tasks = getTasks();
    var issueState = getIssueState();

    if (op === "snapshot") {
      context.setBody(JSON.stringify({ status: "ok", summary: summarize(tasks), tasks: tasks }));
      return;
    }

    if (op === "reserve-dispatch") {
      var reserveRepo = String(body.repo ?? "");
      var reserveIssue = body.issue;
      var reserveKey = issueKey(reserveRepo, reserveIssue);
      var current = issueState[reserveKey] && typeof issueState[reserveKey] === "object" ? issueState[reserveKey] : null;
      if (current && isStaleActiveState(current)) {
        log("reserve.stale_active_released", {
          repo: reserveRepo,
          issue: reserveIssue,
          status: String(current.status ?? ""),
          idempotency_key: String(current.idempotency_key ?? ""),
          updated_at: String(current.updated_at ?? "")
        });
        var staleTaskKey = String(current.idempotency_key ?? "");
        if (staleTaskKey) {
          var staleTask = tasks[staleTaskKey] && typeof tasks[staleTaskKey] === "object" ? tasks[staleTaskKey] : {};
          staleTask.idempotency_key = staleTaskKey;
          staleTask.repo = String(staleTask.repo ?? reserveRepo);
          staleTask.issue = staleTask.issue ?? reserveIssue;
          staleTask.run_id = String(staleTask.run_id ?? current.run_id ?? "");
          staleTask.status = "failed";
          staleTask.retryable = true;
          staleTask.error = "true";
          staleTask.error_code = "stale_active_dispatch";
          staleTask.error_message = "stale active develop dispatch was released";
          staleTask.completed_at = toIso(context.getTimestamp());
          staleTask.updated_at = staleTask.completed_at;
          if (!staleTask.created_at) staleTask.created_at = staleTask.completed_at;
          tasks[staleTaskKey] = staleTask;
          setTasks(tasks);
        }
        delete issueState[reserveKey];
        setIssueState(issueState);
        current = null;
      }
      if (current && isActiveStatus(String(current.status ?? ""))) {
        context.setBody(JSON.stringify({
          status: "ok",
          reserved: false,
          reason: "active-task-exists",
          active: current
        }));
        return;
      }

      var reserved = {
        repo: reserveRepo,
        issue: reserveIssue,
        idempotency_key: String(body.idempotency_key ?? ""),
        run_id: String(body.run_id ?? ""),
        status: "reserved",
        updated_at: toIso(context.getTimestamp())
      };
      issueState[reserveKey] = reserved;
      setIssueState(issueState);
      context.setBody(JSON.stringify({ status: "ok", reserved: true, active: reserved }));
      return;
    }

    if (op === "release-dispatch") {
      var releaseKey = issueKey(String(body.repo ?? ""), body.issue);
      var existingRelease = issueState[releaseKey] && typeof issueState[releaseKey] === "object" ? issueState[releaseKey] : null;
      if (existingRelease) {
        var requestedIdempotency = String(body.idempotency_key ?? "");
        var existingIdempotency = String(existingRelease.idempotency_key ?? "");
        if (!requestedIdempotency || !existingIdempotency || requestedIdempotency === existingIdempotency) {
          delete issueState[releaseKey];
          setIssueState(issueState);
        }
      }
      context.setBody(JSON.stringify({ status: "ok", released: true }));
      return;
    }

    var key = String(body.idempotency_key ?? "");
    if (!key) {
      context.sendMetric(context.getTimestamp(), "opscotch_ai_developer.errors", 1.0, { error: "true", operation: "develop", stage: "tracking", error_code: "idempotency_key_required" });
      context.sendMetric(context.getTimestamp(), "opscotch_ai_developer.develop.errors", 1.0, { error: "true", operation: "develop", stage: "tracking", error_code: "idempotency_key_required" });
      context.setBody(JSON.stringify({ status: "error", error: "idempotency_key required" }));
      return;
    }

    var task = tasks[key] && typeof tasks[key] === "object" ? tasks[key] : {};
    task.idempotency_key = key;
    task.repo = body.repo !== undefined ? String(body.repo ?? "") : String(task.repo ?? "");
    task.issue = body.issue !== undefined ? body.issue : task.issue;
    task.run_id = body.run_id !== undefined ? String(body.run_id ?? "") : String(task.run_id ?? "");
    task.status = body.status !== undefined ? String(body.status ?? "unknown") : String(task.status ?? "unknown");
    task.request_id = body.request_id !== undefined ? String(body.request_id ?? "") : String(task.request_id ?? "");
    task.retryable = body.retryable !== undefined ? !!body.retryable : task.retryable;
    task.error_code = body.error_code !== undefined ? String(body.error_code ?? "") : String(task.error_code ?? "");
    task.error_message = body.error_message !== undefined ? String(body.error_message ?? "") : String(task.error_message ?? "");
    if (body.error !== undefined) {
      task.error = String(body.error ?? "");
    } else if (task.status === "failed" || task.error_code || task.error_message) {
      task.error = "true";
    }
    task.duration_ms = body.duration_ms !== undefined ? body.duration_ms : task.duration_ms;
    task.attempt = body.attempt !== undefined ? body.attempt : task.attempt;

    var nowIso = toIso(context.getTimestamp());
    task.updated_at = nowIso;
    if (!task.created_at) task.created_at = nowIso;
    if (!task.started_at && (task.status === "running" || task.status === "dispatched")) task.started_at = nowIso;
    if (body.started_at) task.started_at = String(body.started_at);
    if (body.dispatched_at) task.dispatched_at = String(body.dispatched_at);
    if (body.completed_at) task.completed_at = String(body.completed_at);

    tasks[key] = task;
    setTasks(tasks);

    var stateKey = issueKey(task.repo, task.issue);
    if (isActiveStatus(String(task.status ?? ""))) {
      issueState[stateKey] = {
        repo: task.repo,
        issue: task.issue,
        idempotency_key: key,
        run_id: task.run_id,
        status: task.status,
        updated_at: task.updated_at
      };
    } else {
      var currentState = issueState[stateKey] && typeof issueState[stateKey] === "object" ? issueState[stateKey] : null;
      if (!currentState || String(currentState.idempotency_key ?? "") === key) {
        delete issueState[stateKey];
      }
    }
    setIssueState(issueState);

    context.setBody(JSON.stringify({ status: "ok", task: task }));
  });
