/*
Will generate the payload and set the url to 
obtain the access token for the azure vault

Expects the following:
- exchange property set named "OPSCOTCH_AUTH_DATA" to contain:
{
    "azureVaultHost" : "<host-ref of azure vault to use>"
}

Property in thr Bootstrap host data called "secret":
{
    "data" : {
        "hosts" : {
            "theAzureVaultHost" : {
                "secret" : "the azure app reg secret",
            }
        }
    }
}

*/
//console.log(context.getProperty("OPSCOTCH_AUTH_DATA"))
passedAuthData = JSON.parse(context.getProperty("OPSCOTCH_AUTH_DATA"));
data = JSON.parse(context.getData());
//console.log(context.getRestrictedDataFromHost(passedAuthData["azureVaultHost"]))
restrictedData = JSON.parse(context.getRestrictedDataFromHost(passedAuthData["azureVaultHost"]))

if (!restrictedData.hasOwnProperty("secret")) {
    throw "secret not found in restrictedData";
}

context.setMessage(restrictedData["secret"]);
