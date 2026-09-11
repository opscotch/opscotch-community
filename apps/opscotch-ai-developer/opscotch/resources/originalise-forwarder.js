doc
  .description("Transparent forwarder that strips preserved original section before downstream call and reattaches it on response")
  .asUserErrors()
  .inSchema({
    type: "object",
    additionalProperties: true,
    properties: {}
  })
  .dataSchema({
    type: "object",
    required: ["forwardStepId", "requestProperty", "responseProperty"],
    additionalProperties: true,
    properties: {
      forwardStepId: { type: "string", description: "Step ID to forward to" },
      forwardDeploymentAccessId: { type: "string", description: "Deployment access ID" },
      requestProperty: { type: "string", description: "Property path to modify in request" },
      responseProperty: { type: "string", description: "Property path to modify in response" }
    }
  })
  .outSchema({
    type: "object",
    properties: {
      response: { type: "object", description: "Forwarded response" }
    }
  })
  .run(() => {

    function getPath(obj, path) {
      var parts = (path ?? "").split(".");
      var current = obj;
      for (var i = 0; i < parts.length; i += 1) {
        var key = parts[i];
        if (!key) continue;
        if (current === null || current === undefined || typeof current !== "object") return undefined;
        current = current[key];
      }
      return current;
    }

    function setPath(obj, path, value) {
      var parts = (path ?? "").split(".");
      var current = obj;
      for (var i = 0; i < parts.length; i += 1) {
        var key = parts[i];
        if (!key) continue;
        if (i === parts.length - 1) {
          current[key] = value;
          return;
        }
        if (!current[key] || typeof current[key] !== "object") current[key] = {};
        current = current[key];
      }
    }

    function containsPreservedMarker(text) {
      var preservedHeaderRegex = /^\s{0,3}(?:#{1,6}\s*)?Original Issue Body \(Preserved\)\s*$/im;
      return preservedHeaderRegex.test(String(text ?? ""));
    }

    function stripPreservedSection(text) {
      var value = String(text ?? "");
      var preservedHeaderRegex = /^\s{0,3}(?:#{1,6}\s*)?Original Issue Body \(Preserved\)\s*$/im;
      var match = preservedHeaderRegex.exec(value);
      if (!match) return value;
      return value.slice(0, match.index).trim();
    }

    function stripAllPreservedSections(text) {
      var current = String(text ?? "");
      while (containsPreservedMarker(current)) {
        var next = stripPreservedSection(current);
        if (next === current) break;
        current = next;
      }
      return current.trim();
    }

    function extractCanonicalOriginalBody(text) {
      var value = String(text ?? "");
      var preservedHeaderRegex = /^\s{0,3}(?:#{1,6}\s*)?Original Issue Body \(Preserved\)\s*$/gim;
      var matches = Array.from(value.matchAll(preservedHeaderRegex));
      if (matches.length === 0) return null;
      var last = matches[matches.length - 1];
      var start = (last.index ?? 0) + last[0].length;
      var body = value.slice(start);
      return body.replace(/^\s+/, "").replace(/\s+$/, "");
    }

    function composeFinalIssueBody(refinedBody, originalBody) {
      var cleanedRefined = stripAllPreservedSections(refinedBody);
      var original = extractCanonicalOriginalBody(originalBody);
      if (original === null) original = stripAllPreservedSections(originalBody);
      if (!String(original ?? "").trim()) return cleanedRefined;
      return cleanedRefined + "\n\n## Original Issue Body (Preserved)\n\n" + original;
    }

    var payload = JSON.parse(context.getBody());
    var data = JSON.parse(context.getData());

    var forwardStepId = data.forwardStepId.trim();
    var forwardDeploymentAccessId = data.forwardDeploymentAccessId ? data.forwardDeploymentAccessId.trim() : "";
    var requestProperty = data.requestProperty.trim();
    var responseProperty = data.responseProperty.trim();

    var originalRequestBody = String(getPath(payload, requestProperty) ?? "");
    var cleanedRequestBody = stripAllPreservedSections(originalRequestBody);
    setPath(payload, requestProperty, cleanedRequestBody);

    var response = forwardDeploymentAccessId
      ? context.sendToStep(forwardDeploymentAccessId, forwardStepId, JSON.stringify(payload))
      : context.sendToStep(forwardStepId, JSON.stringify(payload));

    var responseBody = JSON.parse(response?.getBody() ?? "{}");
    if (response.isErrored() && !responseBody.error) {
      responseBody.error = {
        code: "forward_step_errored",
        message: "forward step errored",
        retryable: true
      };
    }
    var refinedBody = String(getPath(responseBody, responseProperty) ?? "");
    if (refinedBody) {
      setPath(responseBody, responseProperty, composeFinalIssueBody(refinedBody, originalRequestBody));
    }

    context.setBody(JSON.stringify(responseBody));
  });
