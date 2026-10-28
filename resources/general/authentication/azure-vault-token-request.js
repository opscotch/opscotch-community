doc
    .description("Sets the request URL to the Azure vault host from OPSCOTCH_AUTH_DATA.")
    .inPropertySchema({
        type: "object",
        required: ["OPSCOTCH_AUTH_DATA"],
        properties: {
            OPSCOTCH_AUTH_DATA: {
                type: "string"
            }
        }
    })
    .run(() => {
        const passedAuthData = JSON.parse(context.getProperty("OPSCOTCH_AUTH_DATA"));

        context.setUrl(passedAuthData["azureVaultHost"], "");
    });
