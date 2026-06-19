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
        const keyPair = context.crypto().generateKeyPair(request.purpose);
        const bytes = context.bytes();

        setJsonResponse(200, {
            ok: true,
            purpose: request.purpose,
            encoding: "hex",
            keyPair: {
                publicKeyHex: keyPair[0] ? bytes.binaryToHex(keyPair[0]) : null,
                secretKeyHex: bytes.binaryToHex(keyPair[1])
            }
        });
    });
