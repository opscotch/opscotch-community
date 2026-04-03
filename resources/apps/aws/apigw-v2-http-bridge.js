doc
    .description("Normalizes an API Gateway v2 event into an Opscotch HTTP request, forwards it to a target step or deployment callback, and wraps the result as a Lambda proxy response")
    .inSchema({
        type: "object",
        required: ["version", "rawPath", "requestContext"],
        properties: {
            version: {
                type: "string",
                constant: "2.0"
            },
            rawPath: {
                type: "string"
            },
            rawQueryString: {
                type: "string"
            },
            headers: {
                type: "object",
                additionalProperties: {
                    type: ["string", "number", "boolean", "null"]
                }
            },
            cookies: {
                type: "array",
                items: {
                    type: "string"
                }
            },
            queryStringParameters: {
                type: "object",
                additionalProperties: {
                    type: ["string", "number", "boolean", "null"]
                }
            },
            body: {
                type: ["string", "object", "null"]
            },
            isBase64Encoded: {
                type: "boolean"
            },
            requestContext: {
                type: "object",
                required: ["http"],
                properties: {
                    http: {
                        type: "object",
                        required: ["method"],
                        properties: {
                            method: {
                                type: "string"
                            },
                            path: {
                                type: "string"
                            }
                        },
                        additionalProperties: true
                    }
                },
                additionalProperties: true
            }
        },
        additionalProperties: true
    })
    .dataSchema({
        type: "object",
        required: ["stepId"],
        properties: {
            deploymentAccessId: {
                type: "string",
                minLength: 1
            },
            stepId: {
                type: "string",
                minLength: 1
            }
        }
    })
    .run(() => {
        const bytes = context.bytes();
        
        const event = JSON.parse(context.getBody() || "{}");

        context.removeAllHeaders();
        const headers = event.headers || {};
        
        let requestBody = event.body;
        if (event.isBase64Encoded === true && typeof requestBody === "string") {
            requestBody = bytes.toString(bytes.base64ToBinary(requestBody));
        }

        const proxyPath = event.pathParameters &&
            event.pathParameters.proxy !== undefined &&
            event.pathParameters.proxy !== null
            ? String(event.pathParameters.proxy)
            : null;
        const opscotchPath = proxyPath !== null
            ? `/${proxyPath.replace(/^\/+/, "")}`
            : event.rawPath;
        const opscotchRequest = {
            path: opscotchPath,
            method: event.requestContext && event.requestContext.http
                ? event.requestContext.http.method
                : null,
            queryString: event.rawQueryString || "",
            headers: headers,
            isBase64Encoded: false
        };

        if (requestBody !== undefined && requestBody !== null) {
            opscotchRequest.body =
                typeof requestBody === "string" ? requestBody : JSON.stringify(requestBody);
        }

        const deploymentAccessId = context.getData("deploymentAccessId");
        const response = deploymentAccessId
            ? context.sendToStep(
                deploymentAccessId,
                context.getData("stepId"),
                JSON.stringify(opscotchRequest),
                headers
            )
            : context.sendToStep(
                context.getData("stepId"),
                JSON.stringify(opscotchRequest),
                headers
            );

        const responseBody = response.getBody() || "";

        try {
            const parsedResponseBody = JSON.parse(responseBody);
            if (parsedResponseBody
                && typeof parsedResponseBody === "object"
                && parsedResponseBody.statusCode !== undefined
                && parsedResponseBody.headers !== undefined
                && parsedResponseBody.body !== undefined) {
                context.setProperty("useResponse", "true");
                context.setBody(responseBody);
                return;
            }
        } catch (e) {
            // not already a lambda proxy response, wrap it below
        }

        const statusCode = parseInt(response.getProperty("status_code") || "200", 10);
        context.setProperty("useResponse", "true");
        context.setBody(JSON.stringify({
            statusCode,
            headers: {
                "content-type": "application/json"
            },
            body: responseBody,
            isBase64Encoded: false
        }));
    });
