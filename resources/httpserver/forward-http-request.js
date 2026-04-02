doc
    .description("Normalize a forwarded HTTP request payload and send it to the configured target server.")
    .inSchema({
        anyOf: [
            {
                type: "object",
                required: ["method"],
                properties: {
                    method: {
                        type: "string"
                    },
                    path: {
                        type: "string"
                    },
                    queryString: {
                        type: "string"
                    },
                    headers: {
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
                    }
                },
                additionalProperties: true
            },
            {
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
                    pathParameters: {
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
            }
        ]
    })
    .run(() => {
        const bytes = context.bytes();

        const request = JSON.parse(context.getBody() || "{}");
        const headers = request.headers || {};

        context.removeAllHeaders();
        Object.keys(headers).forEach((name) => {
            const value = headers[name];
            if (value !== undefined && value !== null) {
                context.setHeader(name, String(value));
            }
        });

        let requestBody = request.body;
        if (request.isBase64Encoded === true && typeof requestBody === "string") {
            requestBody = bytes.toString(bytes.base64ToBinary(requestBody));
        }

        const httpContext = request.requestContext && request.requestContext.http
            ? request.requestContext.http
            : null;
        const proxyPath = request.pathParameters &&
            request.pathParameters.proxy !== undefined &&
            request.pathParameters.proxy !== null
            ? String(request.pathParameters.proxy)
            : null;
        const requestPath = typeof request.path === "string" && request.path.length > 0
            ? request.path
            : (
                proxyPath !== null
                    ? `/${proxyPath.replace(/^\/+/, "")}`
                    : (request.rawPath || (httpContext && httpContext.path) || "/")
            );
        const queryString = typeof request.queryString === "string"
            ? request.queryString.replace(/^\?/, "")
            : (request.rawQueryString || "");
        const pathWithQuery = queryString ? `${requestPath}?${queryString}` : requestPath;
        const method = typeof request.method === "string" && request.method.length > 0
            ? request.method
            : ((httpContext && httpContext.method) || "POST");

        context.setHttpMethod(method);
        context.setUrl("target-server", pathWithQuery);

        if (requestBody !== undefined && requestBody !== null) {
            context.setBody(
                typeof requestBody === "string" ? requestBody : JSON.stringify(requestBody)
            );
        } else {
            context.setBody("");
        }
    });
