const allowedPurposes = ["sign", "box", "secretbox"];

doc
    .description("Generate a cryptographic key pair for a supported Opscotch crypto purpose.")
    .inSchema({
        type: "object",
        required: ["purpose"],
        properties: {
            purpose: {
                type: "string",
                enum: allowedPurposes
            }
        }
    })
    .outSchema({
        type: "object",
        required: ["ok"],
        properties: {
            ok: { type: "boolean" },
            purpose: {
                type: "string",
                enum: allowedPurposes
            },
            encoding: {
                type: "string",
                enum: ["hex"]
            },
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
                        items: {
                            type: "string",
                            enum: allowedPurposes
                        }
                    }
                }
            }
        }
    })
    .run(() => {
        function setJsonResponse(statusCode, payload) {
            context.setProperty("status_code", String(statusCode));
            context.setHeader("content-type", "application/json");
            context.setBody(JSON.stringify(payload));
        }
        const request = JSON.parse(context.getBody() || "{}");
        const purpose = String(request.purpose || "").trim();

        if (!purpose) {
            setJsonResponse(400, {
                ok: false,
                error: {
                    code: "missing_purpose",
                    message: "Query parameter 'purpose' is required.",
                    allowedPurposes: allowedPurposes
                }
            });
            return;
        }

        if (allowedPurposes.indexOf(purpose) < 0) {
            setJsonResponse(400, {
                ok: false,
                error: {
                    code: "invalid_purpose",
                    message: "Query parameter 'purpose' must be one of: sign, box, secretbox.",
                    allowedPurposes: allowedPurposes
                }
            });
            return;
        }

        const keyPair = context.crypto().generateKeyPair(purpose);
        const bytes = context.bytes();

        setJsonResponse(200, {
            ok: true,
            purpose: purpose,
            encoding: "hex",
            keyPair: {
                publicKeyHex: keyPair[0] ? bytes.binaryToHex(keyPair[0]) : null,
                secretKeyHex: bytes.binaryToHex(keyPair[1])
            }
        });
    });
