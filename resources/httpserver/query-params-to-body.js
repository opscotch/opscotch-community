doc
    .description("Extract HTTP query parameters into the request body as a JSON object.")
    .inSchema({
        type: "object",
        properties: {
            query: {
                type: "string"
            }
        }
    })
    .dataSchema({
        type: "object",
        properties: {
            extract: {
                type: "array",
                items: {
                    type: "string"
                }
            }
        }
    })
    .run(() => {
        const request = JSON.parse(context.getBody() || "{}");
        const queryString = typeof request.query === "string" ? request.query : "";
        const params = {};

        if (queryString) {
            const normalized = queryString[0] === "?" ? queryString.substring(1) : queryString;
            const pairs = normalized ? normalized.split("&") : [];

            for (let i = 0; i < pairs.length; i++) {
                const pair = pairs[i];
                if (!pair) {
                    continue;
                }

                const parts = pair.split("=");
                const key = decodeURIComponent(parts[0] || "");
                const value = decodeURIComponent(parts[1] || "");
                params[key] = value;
            }
        }

        const extract = context.getData("extract");
        if (extract) {
            const body = {};
            JSON.parse(extract).forEach((param) => {
                body[param] = params[param];
            });
            context.setBody(JSON.stringify(body));
            return;
        }

        context.setBody(JSON.stringify(params));
    });
