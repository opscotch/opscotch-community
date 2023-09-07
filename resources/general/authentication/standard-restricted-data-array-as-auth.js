/*
Given an array of keys to some data, and a restricted host, sets the data as an Authentication Property 
on the specified step

{
    "data" : {
        "fromHost" : "theHost",
        "authValues": [
        {
            "keyOfValue": "auth1",
            "headerName": "auth1"
        },
        {
            "keyOfValue": "auth2",
            "headerName": "auth2"
        }
        ],
        "propertiesStoredOnStep": "auth-appd-basic",
        "propertyName": "Authorization"
    }
}
...

Bootstrap data:
{
    "hosts" : {
        "theHost" : {
            "auth1" : "this is the head",
            "auth2" : "this is the leg"
        }
    }
}

*/

restrictedData = JSON.parse(context.getRestrictedDataFromHost(context.getData("fromHost")))
keyValues = JSON.parse(context.getData("authValues"));

authenticationProperties = {};


keyValues.forEach(key => {
    if (!restrictedData.hasOwnProperty(key.keyOfValue)) {
        throw key.keyOfValue + " not found in restrictedData";
    }
    authenticationProperties[key.headerName] = restrictedData[key.keyOfValue];
});
context.setAuthenticationPropertiesOnStep(context.getData("propertiesStoredOnStep"), 3600000, context.getData("propertyName"), JSON.stringify(authenticationProperties));
