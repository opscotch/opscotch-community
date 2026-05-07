doc
    .description("Build payloads for GitHub Actions operations")
    .asUserErrors()
    .inSchema({
        type: "object",
        required: ["repo"],
        additionalProperties: true,
        properties: {
            operation: { type: "string" },
            repo: { type: "string" },
            ref: { type: "string" },
            inputs: {
                type: "object",
                additionalProperties: true
            }
        }
    })
    .dataSchema({
        type: "object",
        additionalProperties: true,
        properties: {
            operation: { type: "string" }
        }
    })
    .run(() => {
        function parseJson(value, fallback) {
            if (value === null || value === undefined || value === "") {
                return fallback;
            }
            return JSON.parse(value);
        }

        var data = parseJson(context.getData(), {});
        var input = parseJson(context.getBody(), {});
        var operation = String(input.operation || data.operation || "").trim();

        if (operation === "trigger-workflow") {
            var ref = String(input.ref || "").trim();
            if (!ref) {
                throw new Error("ref is required for trigger-workflow operation");
            }

            var payload = { ref: ref };
            if (input.inputs && typeof input.inputs === "object" && !Array.isArray(input.inputs)) {
                payload.inputs = input.inputs;
            }

            context.setHeader("Content-Type", "application/json");
            context.setBody(JSON.stringify(payload));
            return;
        }

        if (operation === "list-workflow-runs" || operation === "get-workflow-run") {
            context.setBody("");
            return;
        }

        throw new Error("unsupported operation: " + operation);
    });
