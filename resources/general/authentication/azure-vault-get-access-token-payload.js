doc
    .description("Sets the Azure vault access-token request body from the restricted host secret in OPSCOTCH_AUTH_DATA.")
    .inPropertySchema({
        type: "object",
        required: ["OPSCOTCH_AUTH_DATA"],
        properties: {
            OPSCOTCH_AUTH_DATA: { type: "string" }
        }
    })
    .run(() => {
        //console.log(context.getProperty("OPSCOTCH_AUTH_DATA"))
        const passedAuthData = JSON.parse(context.getProperty("OPSCOTCH_AUTH_DATA"));
        const data = JSON.parse(context.getData());
        //console.log(context.getRestrictedDataFromHost(passedAuthData["azureVaultHost"]))
        const restrictedData = JSON.parse(context.getRestrictedDataFromHost(passedAuthData["azureVaultHost"]))

        if (!restrictedData.hasOwnProperty("secret")) {
            throw "secret not found in restrictedData";
        }

        context.setMessage(restrictedData["secret"]);
    });
