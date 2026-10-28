doc
    .description("Validates the body is JSON; on parse failure replaces it with {} and logs the error.")
    .run(() => {
        const body = context.getMessageBodyAsString();

        try {
            JSON.parse(body);
        }
        catch (error) {
            context.setMessage("{}");
            context.diagnosticLog("Failed to parse Body as JSON: " + error.toString());
        }
    });
