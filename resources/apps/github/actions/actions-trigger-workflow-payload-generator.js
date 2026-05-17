doc
    .description("Build payload for GitHub Actions workflow_dispatch dispatch")
    .asUserErrors()
    .inSchema({
        type: "object",
        required: ["ref"],
        properties: {
            ref: { type: "string", description: "Git ref (branch/tag) to dispatch workflow" },
            inputs: { type: "object", description: "Workflow dispatch inputs" }
        }
    })
    .run(() => {
        function parseJson(value, fallback) {
            if (value === null || value === undefined || value === "") {
                return fallback;
            }
            return JSON.parse(value);
        }

        var bodyInput = parseJson(context.getBody(), {});
        var dataInput = parseJson(context.getData(), {});

        var ref = dataInput.ref !== undefined ? dataInput.ref : bodyInput.ref;
        if (!ref) {
            throw new Error("ref is required");
        }
        var payload = { ref: ref };

        var inputs = dataInput.inputs !== undefined ? dataInput.inputs : bodyInput.inputs;
        if (inputs) {
            payload.inputs = inputs;
        }

        context.setHeader("Content-Type", "application/json");
        context.setBody(JSON.stringify(payload));
    });
