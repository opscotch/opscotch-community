doc
  .description("Track run-build task lifecycle")
  .inSchema({
    type: "object",
    required: ["operation"],
    additionalProperties: false,
    properties: {
      operation: {
        type: "string",
        enum: ["update", "snapshot"],
        description: "Use 'update' to write lifecycle state, or 'snapshot' to read all tracked tasks."
      },
      idempotency_key: {
        type: "string",
        description: "Stable key for one build lifecycle record. Required when operation='update'."
      },
      repo: { type: "string", description: "Target repository in owner/repo format." },
      pull_number: { type: "number", description: "Target pull request number." },
      run_id: { type: "number", description: "GitHub Actions run id for the tracked build." },
      status: {
        type: "string",
        enum: ["queued", "running", "succeeded", "failed"],
        description: "Current lifecycle status for the tracked build."
      },
      error_code: { type: "string", description: "Machine-readable error code when status='failed'." },
      error_message: { type: "string", description: "Human-readable error detail when status='failed'." },
      error: { type: "string", description: "Set to \"true\" when this update records a failure, for metric filtering." }
    }
  })
  .outSchema({
    type: "object",
    required: ["status"],
    additionalProperties: true,
    properties: {
      status: { type: "string", enum: ["ok"], description: "Processing result." },
      task: { type: "object", description: "Updated task record when operation='update'." },
      tasks: { type: "object", description: "All tracked tasks keyed by idempotency_key when operation='snapshot'." }
    }
  })
  .run(() => {

    var KEY = "run-build:tasks";
    var body = JSON.parse(context.getBody());

    function getTasks() {
      var raw = context.getPersistedItem(KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      return parsed;
    }

    function setTasks(tasks) {
      context.setPersistedItem(KEY, JSON.stringify(tasks));
    }

    if (body.operation === "snapshot") {
      context.setBody(JSON.stringify({ status: "ok", tasks: getTasks() }));
      return;
    }

    var key = String(body.idempotency_key ?? "");
    if (!key) throw new Error("idempotency_key required for update");

    var tasks = getTasks();
    var existing = tasks[key] && typeof tasks[key] === "object" ? tasks[key] : {};
    var nowIso = new Date(context.getTimestamp()).toISOString();
    var next = {
      idempotency_key: key,
      repo: String(body.repo ?? existing.repo ?? ""),
      pull_number: Number(body.pull_number ?? existing.pull_number ?? 0),
      run_id: Number(body.run_id ?? existing.run_id ?? 0),
      status: String(body.status ?? existing.status ?? "queued"),
      error_code: String(body.error_code ?? existing.error_code ?? ""),
      error_message: String(body.error_message ?? existing.error_message ?? ""),
      error: String(body.error ?? ((String(body.status ?? existing.status ?? "") === "failed" || body.error_code || body.error_message) ? "true" : (existing.error ?? ""))),
      created_at: String(existing.created_at ?? nowIso),
      updated_at: nowIso
    };
    tasks[key] = next;
    setTasks(tasks);
    context.setBody(JSON.stringify({ status: "ok", task: next }));
  });
