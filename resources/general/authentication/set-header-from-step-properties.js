doc
    .description("Applies authentication headers from step properties, invoking authStep synchronously when they are missing.")
    .dataSchema({
        type: "object",
        required: ["propertiesStoredOnStep"],
        properties: {
            propertiesStoredOnStep: { type: "string" },
            propertyName: { type: "string" },
            authStep: { type: "string" },
            passToAuthData: {}
        }
    })
    .inPropertySchema({
        type: "object",
        properties: {
            OPSCOTCH_AUTH_DATA: { type: "string" },
            authPropertyName: { type: "string" }
        }
    })
    .run(() => {
        const passedData = context.getProperty("OPSCOTCH_AUTH_DATA");
        const propertiesFromStep = context.getData("propertiesStoredOnStep");
        let propertyName = context.getProperty("authPropertyName");
        if (!propertyName) {
            propertyName = context.getData("propertyName");
        }

        console.log(`auth property name = ${propertyName}`)

        let headersObjectAsJSONString = context.getAuthenticationPropertiesFromStep(propertiesFromStep, propertyName);

        if (headersObjectAsJSONString == null) {
            const authStep = context.getData("authStep");
            context.setProperty("OPSCOTCH_AUTH_DATA", context.mergeJsonStrings(passedData, context.getData("passToAuthData")));
            context.sendToStep(authStep, null); // this will call the step synchronously and return here when done.
            headersObjectAsJSONString = context.getAuthenticationPropertiesFromStep(propertiesFromStep, propertyName);
        }

        if (headersObjectAsJSONString == null) {
            throw "Authentication has not performed as expected. The expected result from the authentication step is not present;";
        }

        const headersObject = JSON.parse(headersObjectAsJSONString);
        Object.keys(headersObject).forEach(headerName => {
            context.setHeader(headerName, headersObject[headerName]);
        });
    });
