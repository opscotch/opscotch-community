doc
    .description("Sets authentication properties on a step from multiple restricted-host data values.")
    .dataSchema({
        type: "object",
        required: ["fromHost", "authValues", "propertiesStoredOnStep", "propertyName"],
        properties: {
            fromHost: { type: "string" },
            authValues: {
                type: "array",
                items: {
                    type: "object",
                    required: ["keyOfValue", "headerName"],
                    properties: {
                        keyOfValue: { type: "string" },
                        headerName: { type: "string" }
                    }
                }
            },
            propertiesStoredOnStep: { type: "string" },
            propertyName: { type: "string" }
        }
    })
    .run(() => {
        const restrictedData = JSON.parse(context.getRestrictedDataFromHost(context.getData("fromHost")))
        const keyValues = JSON.parse(context.getData("authValues"));

        const authenticationProperties = {};


        keyValues.forEach(key => {
            if (!restrictedData.hasOwnProperty(key.keyOfValue)) {
                throw key.keyOfValue + " not found in restrictedData";
            }
            authenticationProperties[key.headerName] = restrictedData[key.keyOfValue];
        });
        context.setAuthenticationPropertiesOnStep(context.getData("propertiesStoredOnStep"), 3600000, context.getData("propertyName"), JSON.stringify(authenticationProperties));
    });
