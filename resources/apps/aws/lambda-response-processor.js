doc
    .dataSchema(
        {
            required : [ "eventRouting"],
            properties : {
                eventRouting : {
                    minProperties: 1,
                    properties: {
                        sqs: { "$ref": "#/$defs/handler" },
                        sns: { "$ref": "#/$defs/handler" },
                        "apigw-v1": { "$ref": "#/$defs/handler" },
                        "apigw-v2": { "$ref": "#/$defs/handler" },
                        eventbridge: { "$ref": "#/$defs/handler" }
                    },
                    additionalProperties: false,
                    anyOf: [
                        { required: ["sqs"] },
                        { required: ["sns"] },
                        { required: ["apigw-v1"] },
                        { required: ["apigw-v2"] },
                        { required: ["eventbridge"] }
                    ],
                    "$defs": {
                        handler: {
                        type: "object",
                        required: ["deploymentAccessId", "stepId"],
                        properties: {
                            deploymentAccessId: {
                                type: "string"
                            },
                            "stepId": {
                                type: "string"
                            }
                        },
                        additionalProperties: false
                        }
                    }
                }
            }
            
        }
    )
    .run(() => {

        function routeEvent() {

            var event = JSON.parse(context.getBody());

            // In some cases body may still be a JSON string
            if (typeof event === "string") {
                try {
                    event = JSON.parse(event);
                } catch (e) {
                    return "unknown";
                }
            }

            if (!event || typeof event !== "object") {
                return "unknown";
            }

            // ---- SQS ----
            if (
                Array.isArray(event.Records) &&
                event.Records.length > 0 &&
                event.Records[0].eventSource === "aws:sqs"
            ) {
                return "sqs";
            }

            // ---- SNS ----
            if (
                Array.isArray(event.Records) &&
                event.Records.length > 0 &&
                event.Records[0].EventSource === "aws:sns"
            ) {
                return "sns";
            }

            // ---- API Gateway v2 (HTTP API) ----
            if (
                event.version === "2.0" &&
                event.requestContext &&
                event.requestContext.http
            ) {
                return "apigw-v2";
            }

            // ---- API Gateway v1 (REST API) ----
            if (
                event.requestContext &&
                event.httpMethod
            ) {
                return "apigw-v1";
            }

            // ---- EventBridge ----
            if (
                event["detail-type"] &&
                event.source &&
                event.id
            ) {
                return "eventbridge";
            }

            return "unknown";
        }

        const arid = JSON.parse(context.getHeader("Lambda-Runtime-Aws-Request-Id"))[0];
        context.removeHeader("Lambda-Runtime-Aws-Request-Id");
        context.setProperty("awsRequestId", arid);
        context.diagnosticLog(`arid ${arid}`);

        let response;

        var eventRouting = JSON.parse(context.getData("eventRouting"));
        
        const eventKey = routeEvent();
        context.diagnosticLog(`eventKey ${eventKey}`);
        
        if (!eventRouting[eventKey]) {
            context.setProperty("responseType", "error");
            context.sendToStep("lambda-listener-response", JSON.stringify(
                {
                    errorMessage : `event key is not defined for payload type ${eventKey}`,
                    errorType : "Exception"
                }
            ));
            context.end();
        }

        const callback = eventRouting[eventKey];

        context.diagnosticLog(`handler routing ${callback.deploymentAccessId} : ${callback.stepId}`);

        const body = context.getBody();
        if ("_test_" == callback.deploymentAccessId) {
            response = context.sendToStep(callback.stepId, body);
        } else if ( callback.stepId) {
            response = context.sendToStep(callback.deploymentAccessId, callback.stepId, body);
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
        } else if (response.getProperty("useResponse") ) {
            context.setProperty("responseType", "response");
            context.diagnosticLog(`response to lambda ${response.getBody()}`);
            context.setBody(response.getBody());
            context.sendToStep("lambda-listener-response", response.getBody());
        } else {
            context.setProperty("responseType", "response");
            context.sendToStep("lambda-listener-response", "{}");
        }
    });