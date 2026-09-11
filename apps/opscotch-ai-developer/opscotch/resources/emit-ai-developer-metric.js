/* Emits sanitized AI Developer lifecycle metrics. */
doc
  .description("Best-effort AI Developer metric emitter")
  .inSchema({
    type: "object",
    additionalProperties: false,
    properties: {
      metric: { type: "string", minLength: 1 },
      value: { type: "number" },
      operation: { type: "string", enum: ["refine", "develop", "pr_develop", "adversarial_review", "build_tracking"] },
      outcome: { type: "string", enum: ["accepted", "success", "failure"] },
      stage: { type: "string", enum: ["invoke", "callback", "finalize", "dispatch", "tracking"] },
      metadata: {
        type: "object",
        additionalProperties: false,
        properties: {
          operation: { type: "string", enum: ["refine", "develop", "pr_develop", "adversarial_review", "build_tracking"] },
          stage: { type: "string", enum: ["invoke", "callback", "finalize", "dispatch", "tracking"] },
          outcome: { type: "string", enum: ["accepted", "success", "failure"] },
          repo: { type: "string" },
          issue_or_pr: { type: "number" },
          request_id: { type: "string" },
          run_id: { type: "string" },
          idempotency_key: { type: "string" },
          error: { type: "string" },
          error_code: { type: "string" },
          error_message: { type: "string" },
          retryable: { type: "boolean" },
          duration_ms: { type: "number" }
        }
      }
    },
    oneOf: [
      { required: ["operation", "outcome", "stage", "value"] },
      { required: ["metric", "value"] }
    ]
  })
  .run(() => {
    var body = JSON.parse(context.getBody());
    // sendMetric metadata is Map<String,String>; callers pass numbers/booleans
    // (issue_or_pr, duration_ms, retryable). Coerce before the Graal boundary.
    function metricDouble(value) {
      var n = Number(value);
      return isFinite(n) ? n : 0;
    }
    function stringMetadata(raw) {
      var out = {};
      Object.keys(raw || {}).forEach(function(key) {
        var value = raw[key];
        if (value === undefined || value === null) return;
        out[key] = typeof value === "string" ? value : String(value);
      });
      return out;
    }
    var metadata = stringMetadata(body.operation
      ? { ...body.metadata, operation: body.operation, stage: body.stage, outcome: body.outcome }
      : (body.metadata ?? {}));
    if (body.operation) {
      var repoSlug = (metadata.repo || "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "unknown";
      var names = ["opscotch_ai_developer.run." + body.outcome, "opscotch_ai_developer." + body.operation + "." + body.outcome, "opscotch_ai_developer." + repoSlug + "." + body.operation + "." + body.outcome];
      var failure = body.outcome === "failure" || metadata.error_code || metadata.error_message;
      var metricMetadata = failure ? Object.assign({}, metadata, { error: "true" }) : metadata;
      if (failure) {
        names.push("opscotch_ai_developer.errors");
        names.push("opscotch_ai_developer." + body.operation + ".errors");
        if (body.stage) names.push("opscotch_ai_developer." + body.stage + ".errors");
      }
      names.forEach(function(metric) {
        context.sendMetric(context.getTimestamp(), metric, metricDouble(body.value), metricMetadata);
      });
    } else {
      context.sendMetric(context.getTimestamp(), body.metric, metricDouble(body.value), metadata);
    }
    context.setBody(JSON.stringify({ status: "ok" }));
  });
