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

context.setUrl(passedAuthData["azureVaultFetchHost"], "/" + passedAuthData["azureVaultValueName"] + "/?api-version=2016-10-01");