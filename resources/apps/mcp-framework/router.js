doc
    .description("Routes HTTP JSON-RPC MCP requests to the supported internal handler steps")
    .outSchema({
        oneOf: [
            {
                type: "object",
                properties: {
                    jsonrpc: { type: "string", const: "2.0" },
                    id: {},
                    result: {},
                    error: { type: "object" }
                }
            },
            {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        jsonrpc: { type: "string", const: "2.0" },
                        id: {},
                        result: {},
                        error: { type: "object" }
                    }
                }
            }
        ]
    })
    .run(() => {
        function log(message) {
            if (context.getData("debug_log")) {
                console.log(message);
            }
        }

        function normalizeHeaders(rawHeaders) {
            if (rawHeaders == null || typeof rawHeaders !== "object") {
                return {};
            }

            var normalized = {};
            Object.keys(rawHeaders).forEach(name => {
                normalized[String(name).toLowerCase()] = rawHeaders[name];
            });
            return normalized;
        }

        function firstHeaderValue(headers, name) {
            var value = headers[String(name).toLowerCase()];
            if (Array.isArray(value)) {
                return value.length === 0 ? null : value[0];
            }
            return value == null ? null : value;
        }

        function setResponse(statusCode, contentType, body) {
            context.setProperty("status_code", statusCode);
            context.removeHeader("content-type");
            if (contentType != null) {
                context.setHeader("content-type", contentType);
            }
            context.setBody(body == null ? null : body);
        }

        function endResponse() {
            context.end();
        }

        function successResponse(id, result) {
            return {
                jsonrpc: "2.0",
                id: id,
                result: result
            };
        }

        function errorResponse(id, code, message, data) {
            var error = {
                code: code,
                message: message
            };

            if (data !== undefined) {
                error.data = data;
            }

            return {
                jsonrpc: "2.0",
                id: id == null ? null : id,
                error: error
            };
        }

        function contextErrorResponse(id, returnedContext, userCode, systemCode, userFallbackMessage, systemFallbackMessage) {
            var userErrors = returnedContext.getUserErrors();
            var allErrors = returnedContext.getAllErrors();
            var message;

            if (userErrors.length > 0) {
                message = returnedContext.getFirstError(userErrors);
                return errorResponse(
                    id,
                    userCode,
                    message == null || message === "" ? userFallbackMessage : "" + message,
                    { userErrors: userErrors }
                );
            }

            message = returnedContext.getFirstError(allErrors);
            return errorResponse(
                id,
                systemCode,
                message == null || message === "" ? systemFallbackMessage : "" + message,
                allErrors.length === 0 ? undefined : { errors: allErrors }
            );
        }

        function finishJson(statusCode, response) {
            setResponse(statusCode, "application/json", JSON.stringify(response));
            endResponse();
        }

        function finishAccepted() {
            setResponse(202, null, null);
            endResponse();
        }

        function finishWarmup() {
            setResponse(200, "application/json", JSON.stringify({
                ok: true,
                endpoint: "/mcp",
                method: "GET",
                warmup: true
            }));
            endResponse();
        }

        function finishMethodNotAllowed(allowed) {
            context.removeHeader("content-type");
            context.setHeader("allow", allowed);
            context.setProperty("status_code", 405);
            context.setBody(null);
            endResponse();
        }

        function isValidOrigin(origin) {
            if (origin == null || origin === "") {
                return true;
            }

            return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(String(origin));
        }

        function validateTransport(headers, event) {
            var origin = firstHeaderValue(headers, "origin");
            if (!isValidOrigin(origin)) {
                finishJson(403, errorResponse(null, -32600, "Forbidden", { detail: "Origin header is not allowed" }));
                return false;
            }

            if (event.method === "GET") {
                finishWarmup();
                return false;
            }

            if (event.method !== "POST") {
                finishMethodNotAllowed("POST, GET");
                return false;
            }

            return true;
        }

        function isJsonRpcResponse(message) {
            return message != null
                && typeof message === "object"
                && !Array.isArray(message)
                && message.jsonrpc === "2.0"
                && message.id !== undefined
                && (Object.prototype.hasOwnProperty.call(message, "result") || Object.prototype.hasOwnProperty.call(message, "error"));
        }

        function isJsonRpcNotification(message) {
            return message != null
                && typeof message === "object"
                && !Array.isArray(message)
                && message.jsonrpc === "2.0"
                && typeof message.method === "string"
                && message.method !== ""
                && message.id == null;
        }

        function isJsonRpcRequest(message) {
            return message != null
                && typeof message === "object"
                && !Array.isArray(message)
                && message.jsonrpc === "2.0"
                && typeof message.method === "string"
                && message.method !== ""
                && message.id != null;
        }

        function invokeHandler(request, stepMap) {
            var methodStep = stepMap[request.method];
            var returnedContext;
            var handlerResponse;

            if (methodStep == null) {
                return errorResponse(request.id, -32601, "Method not found", { method: request.method });
            }

            try {
                returnedContext = context.sendToStep(methodStep, JSON.stringify(request));
                if (returnedContext.isErrored()) {
                    return contextErrorResponse(
                        request.id,
                        returnedContext,
                        -32600,
                        -32603,
                        "Request was invalid",
                        "Internal error"
                    );
                }

                handlerResponse = JSON.parse(returnedContext.getBody());
            } catch (e) {
                return errorResponse(request.id, -32603, "Internal error", { detail: e.message });
            }

            if (handlerResponse.ok === true) {
                return successResponse(request.id, handlerResponse.result);
            }

            if (handlerResponse.error != null) {
                return errorResponse(
                    request.id,
                    handlerResponse.error.code == null ? -32603 : handlerResponse.error.code,
                    handlerResponse.error.message == null ? "Internal error" : handlerResponse.error.message,
                    handlerResponse.error.data
                );
            }

            return errorResponse(request.id, -32603, "Internal error", { detail: "Handler returned an invalid envelope" });
        }

        function processMessage(message, stepMap) {
            if (isJsonRpcResponse(message)) {
                return { kind: "accepted" };
            }

            if (isJsonRpcNotification(message)) {
                return { kind: "accepted" };
            }

            if (isJsonRpcRequest(message)) {
                return { kind: "response", response: invokeHandler(message, stepMap) };
            }

            return {
                kind: "response",
                response: errorResponse(message != null && typeof message === "object" ? message.id : null, -32600, "Invalid Request")
            };
        }

        function run() {
            var event;
            var rawRequestBody;
            var parsedBody;
            var messages;
            var responses;
            var headers;
            var stepMap = {
                "initialize": "initialize",
                "tools/list": "tools-list",
                "tools/call": "tools-call",
                "resources/list": "resources-list",
                "resources/read": "resources-read",
                "prompts/list": "prompts-list",
                "prompts/get": "prompts-get"
            };

            context.removeAllHeaders();

            try {
                event = JSON.parse(context.getProperty("mcp_http_event") || "{}");
            } catch (e) {
                finishJson(400, errorResponse(null, -32700, "Parse error", { detail: e.message }));
                return;
            }

            headers = normalizeHeaders(event.headers);
            if (!validateTransport(headers, event)) {
                return;
            }

            rawRequestBody = context.getBody() == null ? "" : String(context.getBody());
            log("mcp raw body: " + rawRequestBody);
            if (rawRequestBody === "") {
                finishJson(400, errorResponse(null, -32700, "Parse error", { detail: "Request body must be valid JSON" }));
                return;
            }

            try {
                parsedBody = JSON.parse(rawRequestBody);
            } catch (e) {
                finishJson(400, errorResponse(null, -32700, "Parse error", { detail: e.message }));
                return;
            }

            if (Array.isArray(parsedBody) && parsedBody.length === 0) {
                finishJson(400, errorResponse(null, -32600, "Invalid Request", { detail: "Batch requests must not be empty" }));
                return;
            }

            messages = Array.isArray(parsedBody) ? parsedBody : [parsedBody];
            responses = messages
                .map(message => processMessage(message, stepMap))
                .filter(result => result.kind === "response")
                .map(result => result.response);

            if (responses.length === 0) {
                finishAccepted();
                return;
            }

            if (Array.isArray(parsedBody)) {
                finishJson(200, responses);
                return;
            }

            finishJson(200, responses[0]);
        }

        run();
    });
