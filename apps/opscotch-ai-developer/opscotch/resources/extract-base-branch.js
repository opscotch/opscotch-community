doc
  .description("Extract base_branch from issue body and comments")
  .asUserErrors()
  .inSchema({
    type: "object",
    additionalProperties: true,
    properties: {
      issue_body: { type: ["string", "null"], description: "Issue or PR body; GitHub returns null when empty" },
      comments: {
        type: "array",
        description: "Issue comments",
        items: { type: "object", additionalProperties: true }
      },
      base_branch: { type: "string", description: "Explicit base branch" }
    }
  })
  .outSchema({
    type: "object",
    properties: {
      status: { type: "string", enum: ["ok"], description: "Operation status" },
      base_branch: { type: "string", description: "Extracted base branch" },
      source: { type: "string", description: "Source of extraction" }
    }
  })
  .run(() => {

    var payload = JSON.parse(context.getBody());

    function extractFromText(text) {
      var body = String(text ?? "");
      if (!body) return "";
      var pattern = /(?:^|\s)base_branch\s*=\s*([^\s`]+)/ig;
      var match;
      var candidate = "";
      while ((match = pattern.exec(body)) !== null) {
        if (match?.[1]) candidate = String(match[1]).trim();
      }
      return candidate;
    }

    function extractFromComments(comments) {
      if (!Array.isArray(comments)) return "";
      var candidate = "";
      for (var i = 0; i < comments.length; i += 1) {
        var comment = comments[i] ?? {};
        var text = "";
        if (typeof comment === "string") text = comment;
        else if (comment?.body !== undefined) text = String(comment.body ?? "");
        var found = extractFromText(text);
        if (found) candidate = found;
      }
      return candidate;
    }

    var issueBodyBranch = extractFromText(payload.issue_body);
    var commentBranch = extractFromComments(payload.comments);
    var explicitBranch = String(payload.base_branch ?? "").trim();
    var extracted = commentBranch || issueBodyBranch || explicitBranch;

    context.setBody(JSON.stringify({
      status: "ok",
      base_branch: extracted,
      source: commentBranch ? "comments" : (issueBodyBranch ? "issue_body" : (explicitBranch ? "payload" : "none"))
    }));
  });
