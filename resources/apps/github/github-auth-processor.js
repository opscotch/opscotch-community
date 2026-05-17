doc
    .description("Apply GitHub bearer token from restricted host data")
    .asUserErrors()
    .dataSchema({
        type: "object",
        required: ["githubAuthHostId"],
        additionalProperties: true,
        properties: {
            githubAuthHostId: {
                description: "Bootstrap host id containing restricted GitHub token data.",
                type: "string",
                minLength: 1
            }
        }
    })
    .run(() => {
        function parseJson(value, fallback) {
            if (value === null || value === undefined || value === "") {
                return fallback;
            }
            return JSON.parse(value);
        }

        var hostId = String(context.getData("githubAuthHostId")).trim();
        var hostData = parseJson(context.getRestrictedDataFromHost(hostId), {});
        var token = String(hostData.githubToken || hostData.token || hostData.pat || "").trim();

        if (!token || token === "REPLACE_ME_WITH_GH_TOKEN") {
            context.addSystemError("github token is missing in host restricted data");
            context.setProperty("status_code", "500");
            context.setMessage(JSON.stringify({
                error: {
                    type: "SYSTEM",
                    code: "AUTH_CONFIGURATION_ERROR",
                    message: "Missing github token in host data"
                }
            }));
            context.end();
        }

        context.setHeader("Authorization", "Bearer " + token);
    });
