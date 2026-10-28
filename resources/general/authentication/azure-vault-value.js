doc
    .description("Stores an Azure vault secret value as authentication properties on the step named in OPSCOTCH_AUTH_DATA.")
    .inPropertySchema({
        type: "object",
        required: ["OPSCOTCH_AUTH_DATA"],
        properties: {
            OPSCOTCH_AUTH_DATA: { type: "string" }
        }
    })
    .inSchema({
        type: "object",
        required: ["value"],
        properties: {
            value: { type: "string" }
        }
    })
    .run(() => {
        const body = JSON.parse(context.getMessageBodyAsString());
        const passedAuthData = JSON.parse(context.getProperty("OPSCOTCH_AUTH_DATA"));

        const storeOnStep = passedAuthData["propertiesStoredOnStep"];
        const propertyName = passedAuthData["propertyName"];
        const keyName = passedAuthData["propertyAzureVaultValueKeyName"];

        const authenticationProperties = {};
        authenticationProperties[keyName] = body["value"];

        context.setAuthenticationPropertiesOnStep(storeOnStep, 3600000, propertyName, JSON.stringify(authenticationProperties));
    });
