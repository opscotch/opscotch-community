doc
  .description("Compute deterministic PR label transitions")
  .asUserErrors()
  .inSchema({
    type: "object",
    required: ["operation", "labels"],
    additionalProperties: false,
    properties: {
      operation: {
        type: "string",
        enum: ["to-in-progress", "to-pr-review"],
        description: "Label transition mode to apply to the provided label set."
      },
      matched_label: {
        type: "string",
        description: "Matched trigger label to remove when operation is 'to-in-progress'."
      },
      labels: {
        type: "array",
        description: "Current issue/PR labels as plain strings.",
        items: { type: "string", minLength: 1 }
      }
    }
  })
  .outSchema({
    type: "object",
    required: ["status", "labels"],
    additionalProperties: false,
    properties: {
      status: { type: "string", enum: ["ok"], description: "Processing result." },
      labels: {
        type: "array",
        description: "Normalized labels after transition rules are applied.",
        items: { type: "string" }
      }
    }
  })
  .run(() => {

    var body = JSON.parse(context.getBody());
    var op = String(body.operation);
    var matchedLower = String(body.matched_label ?? "").toLowerCase();

    var seen = {};
    var normalized = [];
    for (var i = 0; i < body.labels.length; i += 1) {
      var trimmed = String(body.labels[i]).trim();
      if (!trimmed) continue;
      var lower = trimmed.toLowerCase();
      if (seen[lower]) continue;
      seen[lower] = true;
      normalized.push(trimmed);
    }

    var out = [];
    for (var j = 0; j < normalized.length; j += 1) {
      var label = normalized[j];
      var lowerLabel = label.toLowerCase();
      var drop = false;
      if (lowerLabel === "in progress") drop = true;
      if (lowerLabel === "run build") drop = true;
      if (op === "to-pr-review" && lowerLabel === "pr review") drop = true;
      if (op === "to-in-progress" && matchedLower && lowerLabel === matchedLower) drop = true;
      if (!drop) out.push(label);
    }

    if (op === "to-in-progress") out.push("in progress");
    if (op === "to-pr-review") out.push("pr review");

    context.setBody(JSON.stringify({ status: "ok", labels: out }));
  });
