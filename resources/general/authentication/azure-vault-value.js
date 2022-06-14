/*
Extracts the azure vault value from the the passed response 
and sets the value on the specified step as an property object 
with a key specified by "propertyAzureVaultValueKeyName"

Expects the following:
- exchange property set named "OPSCOTCH_AUTH_DATA" to contain:
{
    "propertiesStoredOnStep" : "step where to store properties",
    "propertyName" : "name of property to store",
    "propertyAzureVaultValueKeyName" : "name of the property to set"
}

Example passed response:
{
    "value":"yesplease!",
    "id":"https://test-opscotch.vault.azure.net/secrets/puppy/ee3a2b527ff54145b806fe1585f36a99",
    "attributes":{
       "enabled":true,
       "created":1603163079,
       "updated":1603163079,
       "recoveryLevel":"Recoverable+Purgeable"
    }
}

Example passed property "OPSCOTCH_AUTH_DATA"
{
    "propertiesStoredOnStep" : "myAuthingStep",
    "propertyName" : "myAuthProperties",
    "propertyAzureVaultValueKeyName" : "myProperty"
}

Example of object set on step with from pass property "propertiesStoredOnStep":
{
    "myAuthProperties" : {
        "myProperty" : "yesplease!"
    }
}
*/

body = JSON.parse(context.getMessageBodyAsString());
passedAuthData = JSON.parse(context.getProperty("OPSCOTCH_AUTH_DATA"));

storeOnStep = passedAuthData["propertiesStoredOnStep"];
propertyName = passedAuthData["propertyName"];
keyName = passedAuthData["propertyAzureVaultValueKeyName"];

authenticationProperties = {};
authenticationProperties[keyName] = body["value"];

context.setAuthenticationPropertiesOnStep(storeOnStep, 1000, propertyName, JSON.stringify(authenticationProperties));