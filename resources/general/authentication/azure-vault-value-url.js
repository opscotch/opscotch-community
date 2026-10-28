doc
    .description("Sets the Azure vault value retrieval URL from OPSCOTCH_AUTH_DATA, resolving restricted value names when present.")
    .inPropertySchema({
        type: "object",
        required: ["OPSCOTCH_AUTH_DATA"],
        properties: {
            OPSCOTCH_AUTH_DATA: { type: "string" }
        }
    })
    .run(() => {
        const passedAuthData = JSON.parse(context.getProperty("OPSCOTCH_AUTH_DATA"));

        let valueName = passedAuthData["azureVaultValueName"];

        // See if we have been passed a reference to a value name on the restricted data of the fetch host
        if (passedAuthData["azureVaultValueNameRestricted"] != null) {
            const restrictedData = JSON.parse(context.getRestrictedDataFromHost(passedAuthData["azureVaultFetchHost"]))

            if (!restrictedData.hasOwnProperty(passedAuthData["azureVaultValueNameRestricted"])) {
                throw passedAuthData["azureVaultValueNameRestricted"] + " not found in restrictedData";
            }
            valueName = restrictedData[passedAuthData["azureVaultValueNameRestricted"]];
        }

        context.setUrl(passedAuthData["azureVaultFetchHost"], "/" + valueName + "/?api-version=2016-10-01");
    });
