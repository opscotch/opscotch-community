doc
    .description("Sets the request URL by substituting {key} in the path with the Jira key from the body.")
    .dataSchema({
        type: "object",
        required: ["host-ref", "path"],
        properties: {
            "host-ref": { type: "string" },
            path: { type: "string" }
        }
    })
    .inSchema({
        type: "object",
        required: ["key"],
        properties: {
            key: { type: "string" }
        }
    })
    .run(() => {
        const data = JSON.parse(context.getData());
        const body = context.getMessageBodyAsString();
        const response = JSON.parse(body);
        context.setUrl(data["host-ref"], data["path"].replace("{key}", response.key));
    });
