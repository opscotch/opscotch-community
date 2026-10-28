doc
    .description("Sets the request URL from step data host-ref and path, and optionally the HTTP method.")
    .dataSchema({
        type: "object",
        required: ["host-ref", "path"],
        properties: {
            "host-ref": { type: "string" },
            path: { type: "string" },
            method: { type: "string" }
        }
    })
    .run(() => {
        const data = JSON.parse(context.getData());
        context.setUrl(data["host-ref"], data["path"]);
        if (data["method"]) {
            context.setHttpMethod(data["method"].toUpperCase());
        }
    });
