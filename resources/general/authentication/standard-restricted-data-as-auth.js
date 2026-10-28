doc
    .description("Sets authentication properties on a step from a restricted-host data value.")
    .dataSchema({
        type: "object",
        required: ["fromHost", "keyOfValue", "headerName", "propertiesStoredOnStep", "propertyName"],
        properties: {
            fromHost: { type: "string" },
            keyOfValue: { type: "string" },
            headerName: { type: "string" },
            propertiesStoredOnStep: { type: "string" },
            propertyName: { type: "string" }
        }
    })
    .run(() => {
        const restictedData = JSON.parse(context.getRestrictedDataFromHost(context.getData("fromHost")))
        const key = context.getData("keyOfValue");

        if (!restictedData.hasOwnProperty(key)) {
            throw key + " not found in restictedData";
        }

        const authenticationProperties = {};
        authenticationProperties[context.getData("headerName")] = restictedData[key];

        context.setAuthenticationPropertiesOnStep(context.getData("propertiesStoredOnStep"), 3600000, context.getData("propertyName"), JSON.stringify(authenticationProperties));
    });
