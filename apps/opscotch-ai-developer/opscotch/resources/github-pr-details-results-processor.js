doc
  .description("Normalize GitHub PR details response")
  .asUserErrors()
  .inSchema({
    type: "object",
    additionalProperties: true,
    description: "GitHub pull request API object",
    properties: {
      body: { type: ["string", "null"], description: "GitHub returns null when the PR description is empty" }
    }
  })
  .outSchema({
    type: "object",
    properties: {
      status: { type: "string", enum: ["ok"], description: "Operation status" },
      pull_number: { type: "number", description: "PR number" },
      head_branch: { type: "string", description: "Source branch" },
      base_branch: { type: "string", description: "Target branch" },
      title: { type: "string", description: "PR title" },
      body: { type: "string", description: "PR body" },
      html_url: { type: "string", description: "PR URL" },
      raw: { type: "object", description: "Raw response" }
    }
  })
  .run(() => {

    var pr = JSON.parse(context.getBody());
    context.setBody(JSON.stringify({
      status: "ok",
      pull_number: pr.number ?? null,
      head_branch: pr.head?.ref ? String(pr.head.ref) : "",
      base_branch: pr.base?.ref ? String(pr.base.ref) : "",
      title: pr.title ?? "",
      body: pr.body ?? "",
      html_url: pr.html_url ?? "",
      raw: pr
    }));
  });
