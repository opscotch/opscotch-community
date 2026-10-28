doc
    .description("Sets the Authorization header from a passed Azure vault token response.")
    .inSchema({
        type: "object",
        required: ["token_type", "access_token"],
        properties: {
            token_type: { type: "string" },
            access_token: { type: "string" },
            expires_in: { type: ["string", "number"] },
            ext_expires_in: { type: ["string", "number"] },
            expires_on: { type: "string" },
            not_before: { type: "string" },
            resource: { type: "string" }
        }
    })
    .run(() => {
        const body = context.getPassedMessageAsString();
        console.log("XXXXXX" + body);
        const json = JSON.parse(body);

        const tokenType = json["token_type"];
        const accessToken = json["access_token"];

        context.setHeader("Authorization", tokenType + " " + accessToken);
    });
