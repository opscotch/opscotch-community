doc
  .description("Periodic status report for develop tasks")
  .outSchema({
    type: "object",
    properties: {
      status: { type: "string", enum: ["ok"], description: "Status" },
      summary: { type: "object", description: "Status summary" }
    }
  })
  .run(() => {
    var TASKS_KEY = "cli-sidecar:develop:tasks";
    var LOG_PREFIX = "report-bmad-develop-status";


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

    var summary = summarize(getTasks());
    var running = Array.isArray(summary.running_tasks) ? summary.running_tasks : [];

    var runningPreview = [];
    for (var i = 0; i < running.length && i < 5; i += 1) {
      var t = running[i] ?? {};
      runningPreview.push({
        issue: t.issue,
        status: t.status,
        run_id: t.run_id,
        duration_ms: t.duration_ms
      });
    }

    context.diagnosticLog("develop-task-status summary: " + JSON.stringify({
        total: summary.total ?? 0,
        queued: summary.queued ?? 0,
        running: summary.running ?? 0,
        dispatched: summary.dispatched ?? 0,
        succeeded: summary.succeeded ?? 0,
        failed: summary.failed ?? 0,
        running_preview: runningPreview
      }));

    context.setBody(JSON.stringify({ status: "ok", summary: summary }));
  });
