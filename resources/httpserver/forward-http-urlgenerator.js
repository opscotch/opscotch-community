doc
    .description("Prepare the target URL and persist the forwarded request payload for the payload generator.")
    .run(() => {
        const request = JSON.parse(context.getBody() || "{}");
        const headers = request.headers || {};

        console.log("forward-http-request incoming payload: " + JSON.stringify({
            keys: Object.keys(request || {}),
            path: request.path || request.rawPath || null,
            queryString: request.queryString || request.rawQueryString || "",
            method: request.method || (request.requestContext && request.requestContext.http ? request.requestContext.http.method : null),
            headerKeys: Object.keys(headers),
            bodyType: request.body == null ? null : typeof request.body,
            bodyLength: typeof request.body === "string" ? request.body.length : null,
            isBase64Encoded: request.isBase64Encoded === true
        }));

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

        context.setProperty("forward_http_request", JSON.stringify(request));
        context.setProperty("method", method);
        context.setProperty("uri", requestPath);
        context.setProperty("queryString", queryString);
        context.setHttpMethod(method);
        context.setUrl("target-server", pathWithQuery);
    });
