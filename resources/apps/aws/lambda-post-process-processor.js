doc
    .description("Optionally invoke a synchronous post-process step before the Lambda Runtime API response is sent.")
    .dataSchema(
        {
            properties: {
                "post-process": {
                    type: "object",
                    required: ["stepId"],
                    properties: {
                        stepId: {
                            type: "string",
                            minLength: 1
                        },
                        deploymentId: {
                            type: "string",
                            minLength: 1
                        }
                    },
                    additionalProperties: false
                }
            }
        }
    )
    .run(() => {
        const responseBody = context.getBody();

        function continueToResponse() {
            context.sendToStep("lambda-listener-response", responseBody);
        }

        var raw = context.getData("post-process");
        if (!raw) {
            continueToResponse();
            return;
        }

        var postProcess;
        try {
            postProcess = typeof raw === "string" ? JSON.parse(raw) : raw;
        } catch (e) {
            context.diagnosticLog("post-process config is malformed JSON; continuing to lambda response");
            context.addSystemError("post-process config is malformed JSON");
            continueToResponse();
            return;
        }

        if (!postProcess || typeof postProcess !== "object" || !postProcess.stepId) {
            context.diagnosticLog("post-process config missing stepId; continuing to lambda response");
            context.addSystemError("post-process config missing stepId");
            continueToResponse();
            return;
        }

        var completed;
        try {
            if (postProcess.deploymentId && postProcess.deploymentId !== "_test_") {
                context.diagnosticLog(`post-process invoking ${postProcess.deploymentId}:${postProcess.stepId}`);
                completed = context.sendToStep(postProcess.deploymentId, postProcess.stepId, responseBody);
            } else {
                context.diagnosticLog(`post-process invoking ${postProcess.stepId}`);
                completed = context.sendToStep(postProcess.stepId, responseBody);
            }
        } catch (e) {
            context.diagnosticLog(`post-process invocation failed: ${e}`);
            context.addSystemError(`post-process invocation failed: ${e}`);
            continueToResponse();
            return;
        }

        if (completed && completed.isErrored && completed.isErrored()) {
            var errors = completed.getAllErrors ? completed.getAllErrors() : [];
            errors.forEach((error) => context.addSystemError(error));
            context.diagnosticLog("post-process step returned errors; continuing to lambda response");
        }

        continueToResponse();
    });
