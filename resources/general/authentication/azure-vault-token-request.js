doc
    .description("Sets the request URL to the Azure vault host from OPSCOTCH_AUTH_DATA.")
    .run(() => {
        const passedAuthData = JSON.parse(context.getProperty("OPSCOTCH_AUTH_DATA"));

        context.setUrl(passedAuthData["azureVaultHost"], "");
    });
