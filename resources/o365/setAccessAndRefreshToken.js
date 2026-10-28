doc
    .description("Persists the O365 refresh token and stores Authorization auth properties from a token response.")
    .dataSchema({
        type: "object",
        required: ["propertiesStoredOnStep", "propertyName"],
        properties: {
            propertiesStoredOnStep: { type: "string" },
            propertyName: { type: "string" }
        }
    })
    .inSchema({
        type: "object",
        required: ["refresh_token", "access_token", "expires_in"],
        properties: {
            refresh_token: { type: "string" },
            access_token: { type: "string" },
            expires_in: { type: "number" }
        }
    })
    .run(() => {
        const body = context.getMessageBodyAsString();
        const data = JSON.parse(body);

        // always set the latest refresh token
        context.setPersistedItem("refreshToken", data["refresh_token"]);

        // set authorization headers
        const authenticationProperties = {
            "Authorization": data["access_token"]
        };

        const accessTokenExpiryInMillis = data["expires_in"] * 1000 - 300000 // expiry minus 5 minutes to ensure we get an updated one
        context.setAuthenticationPropertiesOnStep(context.getData("propertiesStoredOnStep"), accessTokenExpiryInMillis, context.getData("propertyName"), JSON.stringify(authenticationProperties));
    });
