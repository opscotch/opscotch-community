doc
    .description("Restore headers and body for a forwarded HTTP request after URL generation.")
    .run(() => {
        const bytes = context.bytes();
        const request = JSON.parse(context.getProperty("forward_http_request") || "{}");
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

        console.log("forward-http-request normalized outbound request: " + JSON.stringify({
            pathWithQuery: context.getProperty("queryString")
                ? `${context.getProperty("uri")}?${context.getProperty("queryString")}`
                : context.getProperty("uri"),
            method: context.getProperty("method"),
            headerKeys: Object.keys(headers),
            bodyType: requestBody == null ? null : typeof requestBody,
            bodyLength: typeof requestBody === "string" ? requestBody.length : null
        }));

        if (requestBody !== undefined && requestBody !== null) {
            context.setBody(
                typeof requestBody === "string" ? requestBody : JSON.stringify(requestBody)
            );
        } else {
            context.setBody("");
        }
    });
