doc
    .dataSchema(
        {
            required : [ "lambdaEventCallback" ],
            properties : {
                lambdaEvent : {
                    required : [ "deploymentAccessId", "stepId" ],
                    properties : {
                        deploymentAccessId : {
                            type : "string"
                        },
                        stepId : {
                            type : "string"
                        }
                    }
                }
            }
        }
    )
    .run(() => {
        const arid = JSON.parse(context.getHeader("Lambda-Runtime-Aws-Request-Id"))[0];
        context.removeHeader("Lambda-Runtime-Aws-Request-Id");
        context.setProperty("awsRequestId", arid);
        context.diagnosticLog(`arid ${arid}`);

        let response;
        const callback = JSON.parse(context.getData("lambdaEventCallback"));
        const body = context.getBody();
        if ("_test_" == callback.deploymentAccessId) {
            response = context.sendToStep(step, body);
        } else if ( callback.step) {
            response = context.sendToStep(callback.deploymentAccessId, callback.step, body);
        } else {
            context.diagnosticLog(body);
        }

        if (response && response.isErrored()) {
            context.setProperty("responseType", "error");
            context.sendToStep("lambda-listener-response", JSON.stringify(
                {
                    errorMessage : response.getAllErrors()[0],
                    errorType : "Exception"
                }
            ));
        } else {
            context.setProperty("responseType", "response");
            context.sendToStep("lambda-listener-response", "{}");
        }
    });