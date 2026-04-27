doc
    .description("Normalize GitHub issue comments response")
    .asUserErrors()
    .inSchema({
        oneOf: [
            {
                type: "array",
                items: {
                    type: "object",
                    additionalProperties: true
                }
            },
            {
                type: "object",
                additionalProperties: true
            }
        ]
    })
    .run(() => {
        function parseJson(value, fallback) {
            if (value === null || value === undefined || value === "") {
                return fallback;
            }
            return JSON.parse(value);
        }

        var parsed = parseJson(context.getBody(), []);
        var comments = Array.isArray(parsed) ? parsed : [];

        context.setBody(JSON.stringify({
            status: "ok",
            comments: comments,
            comments_count: comments.length
        }));
    });
