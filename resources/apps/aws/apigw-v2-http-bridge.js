doc
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
            stepId: {
                type: "string",
                minLength: 1
            }
        }
    })
    .run(() => {
        const bytes = context.bytes();

        const readUtf8String = (buffer) => {
            const len = bytes.getSize(buffer);
            const readByte = (idx) => bytes.readByte(buffer, idx) & 0xFF;
            let out = "";
            let offset = 0;

            while (offset < len) {
                const byte1 = readByte(offset);

                if (byte1 < 0x80) {
                    out += String.fromCharCode(byte1);
                    offset += 1;
                    continue;
                }

                const needMore = (count) => {
                    if (offset + count >= len) {
                        out += "\uFFFD";
                        offset = len;
                        return true;
                    }
                    return false;
                };

                if ((byte1 & 0xE0) === 0xC0) {
                    if (needMore(1)) continue;
                    const byte2 = readByte(offset + 1);
                    if ((byte2 & 0xC0) !== 0x80) {
                        out += "\uFFFD";
                        offset += 1;
                        continue;
                    }
                    const codePoint = ((byte1 & 0x1F) << 6) | (byte2 & 0x3F);
                    out += String.fromCharCode(codePoint);
                    offset += 2;
                    continue;
                }

                if ((byte1 & 0xF0) === 0xE0) {
                    if (needMore(2)) continue;
                    const byte2 = readByte(offset + 1);
                    const byte3 = readByte(offset + 2);
                    if ((byte2 & 0xC0) !== 0x80 || (byte3 & 0xC0) !== 0x80) {
                        out += "\uFFFD";
                        offset += 1;
                        continue;
                    }
                    const codePoint =
                        ((byte1 & 0x0F) << 12) |
                        ((byte2 & 0x3F) << 6) |
                        (byte3 & 0x3F);
                    out += String.fromCharCode(codePoint);
                    offset += 3;
                    continue;
                }

                if ((byte1 & 0xF8) === 0xF0) {
                    if (needMore(3)) continue;
                    const byte2 = readByte(offset + 1);
                    const byte3 = readByte(offset + 2);
                    const byte4 = readByte(offset + 3);
                    if (
                        (byte2 & 0xC0) !== 0x80 ||
                        (byte3 & 0xC0) !== 0x80 ||
                        (byte4 & 0xC0) !== 0x80
                    ) {
                        out += "\uFFFD";
                        offset += 1;
                        continue;
                    }
                    let codePoint =
                        ((byte1 & 0x07) << 18) |
                        ((byte2 & 0x3F) << 12) |
                        ((byte3 & 0x3F) << 6) |
                        (byte4 & 0x3F);
                    codePoint -= 0x10000;
                    out += String.fromCharCode(
                        0xD800 + ((codePoint >> 10) & 0x3FF),
                        0xDC00 + (codePoint & 0x3FF)
                    );
                    offset += 4;
                    continue;
                }

                out += "\uFFFD";
                offset += 1;
            }

            return out;
        };
        
        const event = JSON.parse(context.getBody() || "{}");

        context.removeAllHeaders();
        const headers = event.headers || {};
        
        let requestBody = event.body;
        if (event.isBase64Encoded === true && typeof requestBody === "string") {
            requestBody = readUtf8String(bytes.base64ToBinary(requestBody));
        }

        const proxyPath = event.pathParameters &&
            event.pathParameters.proxy !== undefined &&
            event.pathParameters.proxy !== null
            ? String(event.pathParameters.proxy)
            : null;
        const opscotchPath = proxyPath !== null
            ? `/${proxyPath.replace(/^\/+/, "")}`
            : event.rawPath;
        const pathWithQuery = event.rawQueryString
            ? `${opscotchPath}?${event.rawQueryString}`
            : opscotchPath;

        const opscotchRequest = {
            path: pathWithQuery,
            method: event.requestContext && event.requestContext.http
                ? event.requestContext.http.method
                : null,
            queryStringParameters: event.queryStringParameters || {}
        };

        if (requestBody !== undefined && requestBody !== null) {
            opscotchRequest.body =
                typeof requestBody === "string" ? requestBody : JSON.stringify(requestBody);
        }

        const response = context.sendToStep(
            context.getData("stepId"),
            JSON.stringify(opscotchRequest),
            headers
        );

        const statusCode = parseInt(response.getProperty("status_code") || "200", 10);
        context.setProperty("useResponse", "true");
        context.setBody(JSON.stringify({
            statusCode,
            headers: {
                "content-type": "application/json"
            },
            body: response.getBody() || "",
            isBase64Encoded: false
        }));
    });
