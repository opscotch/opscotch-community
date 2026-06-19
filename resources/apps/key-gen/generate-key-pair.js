doc
    .description("Generate a cryptographic key pair for a supported Opscotch crypto purpose.")
    .outSchema({
        type: "object",
        required: ["ok"],
        properties: {
            ok: { type: "boolean" },
            purpose: { type: "string" },
            encoding: { type: "string" },
            keyPair: {
                type: "object",
                properties: {
                    publicKeyHex: { type: ["string", "null"] },
                    secretKeyHex: { type: "string" }
                }
            },
            error: {
                type: "object",
                properties: {
                    code: { type: "string" },
                    message: { type: "string" },
                    allowedPurposes: {
                        type: "array",
                        items: { type: "string" }
                    }
                }
            }
        }
    })
    .run(() => {
        const allowedPurposes = ["sign", "box", "secretbox"];

        function setJsonResponse(statusCode, payload) {
            context.setProperty("status_code", String(statusCode));
            context.setHeader("content-type", "application/json");
            context.setBody(JSON.stringify(payload));
        }

        function parseQuery(queryString) {
            const params = {};
            const normalized = queryString[0] === "?" ? queryString.substring(1) : queryString;
            if (!normalized) {
                return params;
            }

            normalized.split("&").forEach((pair) => {
                if (!pair) {
                    return;
                }
                const parts = pair.split("=");
                const key = decodeURIComponent(parts[0] || "");
                const value = decodeURIComponent(parts[1] || "");
                params[key] = value;
            });

            return params;
        }

        function parseRequest() {
            const rawBody = context.getBody();
            if (!rawBody) {
                return {};
            }

            const parsedBody = JSON.parse(rawBody);
            if (parsedBody && typeof parsedBody === "object" && typeof parsedBody.query === "string") {
                return parseQuery(parsedBody.query);
            }

            return parsedBody && typeof parsedBody === "object" ? parsedBody : {};
        }

        const request = parseRequest();
        const purpose = typeof request.purpose === "string" ? request.purpose.trim().toLowerCase() : "";

        if (!purpose) {
            setJsonResponse(400, {
                ok: false,
                error: {
                    code: "missing_purpose",
                    message: "purpose is required",
                    allowedPurposes
                }
            });
            return;
        }

        if (allowedPurposes.indexOf(purpose) === -1) {
            setJsonResponse(400, {
                ok: false,
                error: {
                    code: "invalid_purpose",
                    message: "purpose must be one of sign, box, secretbox",
                    allowedPurposes
                }
            });
            return;
        }

        const keyPair = context.crypto().generateKeyPair(purpose);
        const bytes = context.bytes();

        setJsonResponse(200, {
            ok: true,
            purpose,
            encoding: "hex",
            keyPair: {
                publicKeyHex: keyPair[0] ? bytes.binaryToHex(keyPair[0]) : null,
                secretKeyHex: bytes.binaryToHex(keyPair[1])
            }
        });
    });
