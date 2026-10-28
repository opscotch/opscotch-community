doc
    .description("Sets the request URL by appending a URI-encoded query string from step data.")
    .dataSchema({
        type: "object",
        required: ["host-ref", "path", "query"],
        properties: {
            "host-ref": { type: "string" },
            path: { type: "string" },
            query: { type: "string" }
        }
    })
    .run(() => {
        const data = JSON.parse(context.getData());
        const query = encodeURIComponent(data["query"]);
        context.setUrl(data["host-ref"], data["path"] + query);
    });
