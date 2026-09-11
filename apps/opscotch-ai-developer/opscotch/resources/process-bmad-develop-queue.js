doc
  .description("Process one queued develop request")
  .inSchema({
    oneOf: [
      {
        type: "object",
        additionalProperties: true,
        properties: {
          repo: { type: "string", description: "Repository in owner/repo format" },
          issue: { oneOf: [{ type: "number" }, { type: "string" }], description: "Issue number" },
          trigger_condition: { type: "object", description: "Trigger condition" },
          issue_context: { type: "object", description: "Issue context" },
          updated_at: { type: "string", description: "Update timestamp" }
        }
      },
      {
        type: "null",
        description: "Timer trigger sends no body"
      }
    ]
  })
  .outSchema({
    type: "object",
    properties: {
      processed: { type: "boolean", description: "Whether item was processed" },
      dispatched: { type: "boolean", description: "Whether item was dispatched" },
      run_id: { type: "string", description: "Run ID" },
      idempotency_key: { type: "string", description: "Idempotency key" }
    }
  })
  .run(() => {

    var LEASE_PROPERTY = "cli-sidecar:develop:worker:lease";
    var QUEUE_KEY = "cli-sidecar:develop:queue";
    var STATUS_KEY = "cli-sidecar:develop:status";
    var INFLIGHT_KEY = "cli-sidecar:develop:inflight";

    function getQueue() {
      return JSON.parse(context.getPersistedItem(QUEUE_KEY) ?? "[]");
    }

    function setQueue(queue) {
      context.setPersistedItem(QUEUE_KEY, JSON.stringify(queue));
    }

    function getStatuses() {
      return JSON.parse(context.getPersistedItem(STATUS_KEY) ?? "{}");
    }

    function setStatuses(statuses) {
      context.setPersistedItem(STATUS_KEY, JSON.stringify(statuses));
    }

    function getInflight() {
      return JSON.parse(context.getPersistedItem(INFLIGHT_KEY) ?? "{}");
    }

    function setInflight(inflight) {
      context.setPersistedItem(INFLIGHT_KEY, JSON.stringify(inflight));
    }

    function setLease(value) {
      context.setProperty(LEASE_PROPERTY, value);
    }

    function clearLease() {
      context.setProperty(LEASE_PROPERTY, "");
    }

    function recoverStaleInFlight() {
      var lease = String(context.getProperty(LEASE_PROPERTY) ?? "");
      if (lease) {
        return false;
      }

      var inflight = getInflight();
      var keys = Object.keys(inflight);
      if (keys.length === 0) {
        return false;
      }

      var queue = getQueue();
      var statuses = getStatuses();

      for (var i = 0; i < keys.length; i += 1) {
        var key = keys[i];
        var item = inflight[key];
        if (!item || typeof item !== "object") {
          continue;
        }
        queue.push(item);
        statuses[key] = {
          status: "queued",
          run_id: item._queue?.run_id ? String(item._queue.run_id) : "",
          recovered_at: new Date(context.getTimestamp()).toISOString(),
          recovery_reason: "stale-running-no-lease"
        };
      }

      setQueue(queue);
      setStatuses(statuses);
      setInflight({});
      log("develop-queue-worker recovered stale inflight", { recovered: keys.length });
      return true;
    }

    function log(message, details) {
      var line = message + (details ? ": " + JSON.stringify(details) : "");
      context.diagnosticLog(line);
    }

    function normalizeIssue(value) {
      var issueNumber = parseInt(String(value), 10);
      if (isNaN(issueNumber) || issueNumber <= 0) throw new Error("issue must be a positive integer");
      return issueNumber;
    }

    function normalizeRepo(value) {
      var repo = String(value ?? "").trim();
      if (!repo || repo.indexOf("/") === -1) throw new Error("repo must be in owner/repo format");
      return repo;
    }

    function makeRunId() {
      return "run-" + Date.now() + "-" + Math.floor(Math.random() * 1000000);
    }

    function toLower(value) {
      return String(value ?? "").toLowerCase();
    }

    function hasLabel(issueContext, labelName) {
      if (!issueContext || typeof issueContext !== "object") return false;
      var labels = Array.isArray(issueContext.labels) ? issueContext.labels : [];
      var wanted = toLower(labelName);
      if (!wanted) return true;
      for (var i = 0; i < labels.length; i += 1) {
        var label = labels[i];
        var name = label && typeof label === "object" ? label.name : label;
        if (toLower(name) === wanted) return true;
      }
      return false;
    }

    function isValidQueuedRequest(item) {
      if (!item || typeof item !== "object") return { valid: false, reason: "invalid-item" };
      if (!item.repo || !item.issue) return { valid: false, reason: "missing-core-fields" };

      var trigger = item.trigger_condition && typeof item.trigger_condition === "object" ? item.trigger_condition : {};
      var expectedStepId = String(trigger.expected_step_id ?? "");
      if (expectedStepId && expectedStepId !== "dispatch-bmad-develop") {
        return { valid: false, reason: "unexpected-step-id" };
      }

      var matchedLabel = String(trigger.matched_label ?? "");
      if (matchedLabel && !hasLabel(item.issue_context, matchedLabel)) {
        return { valid: false, reason: "missing-trigger-label" };
      }

      return { valid: true, reason: "ok" };
    }

    function emitStatus(event) {
      try {
        context.sendToStepAndForget("track-bmad-develop-status", JSON.stringify(event));
      } catch (ignore) {
      }
    }

    function enqueueFromPayload(payload) {
      payload.repo = normalizeRepo(payload.repo);
      payload.issue = normalizeIssue(payload.issue);
      payload.operation = "develop";

      var updatedAt = String(payload.updated_at ?? (payload.issue_context?.updated_at) ?? "");
      var idempotencyKey = payload.repo + ":" + payload.issue + ":" + updatedAt + ":develop";

      var statuses = getStatuses();
      var existing = statuses[idempotencyKey];
      if (existing && (existing.status === "queued" || existing.status === "running" || existing.status === "succeeded")) {
        return {
          queued: true,
          routed: true,
          operation: "develop",
          repo: payload.repo,
          issue: payload.issue,
          run_id: existing.run_id ?? "",
          idempotency_key: idempotencyKey,
          status: existing.status,
          duplicate: true
        };
      }

      var runId = makeRunId();
      payload._queue = {
        idempotency_key: idempotencyKey,
        run_id: runId,
        enqueued_at: new Date(context.getTimestamp()).toISOString(),
        attempt: 0
      };

      var queue = getQueue();
      queue.push(payload);
      setQueue(queue);

      statuses[idempotencyKey] = {
        status: "queued",
        run_id: runId,
        enqueued_at: payload._queue.enqueued_at,
        attempt: 0
      };
      setStatuses(statuses);
      emitStatus({
        operation: "update",
        idempotency_key: idempotencyKey,
        run_id: runId,
        repo: payload.repo,
        issue: payload.issue,
        status: "queued",
        attempt: 0
      });

      return {
        queued: true,
        routed: true,
        operation: "develop",
        repo: payload.repo,
        issue: payload.issue,
        run_id: runId,
        idempotency_key: idempotencyKey,
        status: "queued"
      };
    }

    var incoming = JSON.parse(context.getBody());
    if (incoming && typeof incoming === "object" && incoming.repo !== undefined && incoming.issue !== undefined) {
      var enqueueResult = enqueueFromPayload(incoming);
      context.setBody(JSON.stringify(enqueueResult));
      return;
    }

    recoverStaleInFlight();

    var queue = getQueue();
    if (!Array.isArray(queue) || queue.length === 0) {
      context.setBody(JSON.stringify({ processed: false, reason: "empty-queue" }));
      return;
    }

    var item = queue.shift();
    setQueue(queue);
    var validity = isValidQueuedRequest(item);
    if (!validity.valid) {
      log("develop-queue-worker discarded invalid queued item", {
        repo: item?.repo ?? "",
        issue: item?.issue ?? "",
        reason: validity.reason
      });
      context.setBody(JSON.stringify({
        processed: false,
        discarded: true,
        reason: validity.reason,
        repo: item?.repo ?? "",
        issue: item?.issue ?? ""
      }));
      return;
    }

    var q = item?._queue ?? {};
    var key = String(q.idempotency_key ?? "");
    var runId = String(q.run_id ?? "");

    var statuses = getStatuses();
    var inflight = getInflight();
    inflight[key] = item;
    setInflight(inflight);

    statuses[key] = {
      status: "running",
      run_id: runId,
      started_at: new Date(context.getTimestamp()).toISOString(),
      attempt: parseInt(String(q.attempt ?? 0), 10) || 0
    };
    setStatuses(statuses);
    emitStatus({
      operation: "update",
      idempotency_key: key,
      run_id: runId,
      repo: item.repo,
      issue: item.issue,
      status: "running",
      attempt: parseInt(String(q.attempt ?? 0), 10) || 0,
      started_at: statuses[key].started_at
    });
    setLease(JSON.stringify({ run_id: runId, idempotency_key: key, started_at: statuses[key].started_at }));

    try {
      context.sendToStepAndForget("dispatch-bmad-develop-worker", JSON.stringify(item));
      inflight = getInflight();
      delete inflight[key];
      setInflight(inflight);
      statuses[key] = {
        status: "dispatched",
        run_id: runId,
        dispatched_at: new Date(context.getTimestamp()).toISOString(),
        attempt: parseInt(String(q.attempt ?? 0), 10) || 0
      };
      setStatuses(statuses);
      emitStatus({
        operation: "update",
        idempotency_key: key,
        run_id: runId,
        repo: item.repo,
        issue: item.issue,
        status: "dispatched",
        attempt: parseInt(String(q.attempt ?? 0), 10) || 0,
        dispatched_at: statuses[key].dispatched_at
      });
      clearLease();
      context.setBody(JSON.stringify({ processed: true, dispatched: true, run_id: runId, idempotency_key: key }));
    } catch (err) {
      var attempt2 = (parseInt(String(q.attempt ?? 0), 10) || 0) + 1;
      var maxAttempts2 = 3;
      if (attempt2 < maxAttempts2) {
        item._queue.attempt = attempt2;
        queue = getQueue();
        queue.push(item);
        setQueue(queue);
        inflight = getInflight();
        delete inflight[key];
        setInflight(inflight);
        statuses[key] = {
          status: "queued",
          run_id: runId,
          attempt: attempt2,
          last_error: String(err?.message ?? err)
        };
        emitStatus({
          operation: "update",
          idempotency_key: key,
          run_id: runId,
          repo: item.repo,
          issue: item.issue,
          status: "queued",
          attempt: attempt2,
          error: "true",
          error_message: String(err?.message ?? err)
        });
      } else {
        statuses[key] = {
          status: "failed",
          run_id: runId,
          completed_at: new Date(context.getTimestamp()).toISOString(),
          attempt: attempt2,
          error: String(err?.message ?? err)
        };
        inflight = getInflight();
        delete inflight[key];
        setInflight(inflight);
        emitStatus({
          operation: "update",
          idempotency_key: key,
          run_id: runId,
          repo: item.repo,
          issue: item.issue,
          status: "failed",
          attempt: attempt2,
          completed_at: statuses[key].completed_at,
          error: "true",
          error_message: String(err?.message ?? err)
        });
      }
      setStatuses(statuses);
      clearLease();
      log("develop-queue-worker failed", { run_id: runId, idempotency_key: key, error: String(err?.message ?? err) });
      context.setBody(JSON.stringify({ processed: false, run_id: runId, idempotency_key: key }));
    }
  });
