doc
  .description("Handle action-runner state change notifications for builder runs")
  .inSchema({
    type: "object",
    additionalProperties: true,
    properties: {}
  })
  .outSchema({
    type: "object",
    properties: {
      response: { type: "object", description: "Forwarded response" }
    }
  })
  .run(() => {

    function logDiagnostic(message, details) {
      var line = message + (details ? ": " + JSON.stringify(details) : "");
      context.diagnosticLog(line);
    }

    function normalizeNotification(rawBody) {
      var parsed = JSON.parse(rawBody ?? "{}");
      var run = parsed && typeof parsed.run === "object" ? parsed.run : {};
      var watched = parsed && typeof parsed.watched === "object" ? parsed.watched : {};
      var runId = parseInt(String(run.id ?? ""), 10);
      if (isNaN(runId) || runId <= 0) {
        throw new Error("invalid action-state payload: run.id missing or invalid");
      }
      return {
        notification_type: "github-action-state-change",
        watched: {
          logsToCollect: String(watched.logsToCollect ?? "")
        },
        run: {
          id: runId,
          status: String(run.status ?? ""),
          conclusion: String(run.conclusion ?? ""),
          html_url: String(run.html_url ?? "")
        }
      };
    }

    var body = context.getBody();
    var normalized = normalizeNotification(body);
    logDiagnostic("builder-state normalized", { run_id: normalized.run.id, status: normalized.run.status, conclusion: normalized.run.conclusion });
    var response = context.sendToStep("process-run-build-tracking-queue", JSON.stringify(normalized));
    if (response.isErrored()) {
      throw new Error("process-run-build-tracking-queue step errored");
    }
    context.setBody(response?.getBody() ?? JSON.stringify(body));
  });
