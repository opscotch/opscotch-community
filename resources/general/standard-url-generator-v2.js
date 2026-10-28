doc
    .description("Sets the request URL with ${property} substitutions from data, passed message, and body.")
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
        const sub = (obj, path) => {
            const entries = Object.entries(obj);
            for (let i = 0; i < entries.length; i++) {
                const k = entries[i][0];
                const v = entries[i][1];
                path = path.replaceAll("${" + k + "}", v)
            }
            return path;
        }

        const data = JSON.parse(context.getData());
        let path = data["path"];

        // sub data
        path = sub(data, path);

        // sub passed
        try {
            path = sub(JSON.parse(context.getPassedMessageAsString()), path);
        } catch {
            // only works for json!
        }

        // sub body
        try {
            path = sub(JSON.parse(context.getMessageBodyAsString()), path);
        } catch {
            // only works for json!
        }

        context.setUrl(data["host-ref"], path);

        if (data["method"]) {
            context.setHttpMethod(data["method"].toUpperCase());
        }
    });
