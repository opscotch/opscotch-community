/*
Sets the url for retrieving the requested value from the vault.

Expects the following:
- exchange property set named "OPSCOTCH_AUTH_DATA" to contain:
{
    "azureVaultHost" : "<host-ref of azure vault to use",
    "azureVaultValueName" : "name of value to retrieve from vault"
}

*/

passedAuthData = JSON.parse(context.getProperty("OPSCOTCH_AUTH_DATA"));

valueName = passedAuthData["azureVaultValueName"];

// See if we have been passed a reference to a value name on the restricted data of the fetch host 
if (passedAuthData["azureVaultValueNameRestricted"] != null) {
    restrictedData = JSON.parse(context.getRestrictedDataFromHost(passedAuthData["azureVaultFetchHost"]))

    if (!restrictedData.hasOwnProperty(passedAuthData["azureVaultValueNameRestricted"])) {
        throw passedAuthData["azureVaultValueNameRestricted"] + " not found in restrictedData";
    }
    valueName = restrictedData[passedAuthData["azureVaultValueNameRestricted"]];
}

context.setUrl(passedAuthData["azureVaultFetchHost"], "/" + valueName + "/?api-version=2016-10-01");