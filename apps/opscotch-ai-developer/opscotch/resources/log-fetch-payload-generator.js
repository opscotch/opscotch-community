doc
  .description("Build payload for wrapper log_fetch endpoint")
  .asUserErrors()
  .inSchema({
    type: "object",
    required: ["url"],
    properties: {
      url: { type: "string", description: "Redirect URL to fetch logs from" }
    }
  })
  .run(() => {

    var body = JSON.parse(context.getBody());
    var url = body.url.trim();
    context.setBody(JSON.stringify({ url: url }));
  });
