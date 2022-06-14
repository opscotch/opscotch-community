/*
Given a key to some data, and a restricted host, sets the data as an Authentication Property 
on the specified step

{
    "data" : {
        "fromHost" : "theHost",
        "keyOfValue" : "myBody",
        "headerName" : "myHeader",
        "propertiesStoredOnStep": "auth-appd-basic",
        "propertyName": "Authorization"
    }
}
...

Bootstrap data:
{
    "data" : {
        "hosts" : {
            "theHost" : {
                "myBody" : "this is the body",
            }
        }
    }
}

*/

restictedData = JSON.parse(context.getRestrictedDataFromHost(context.getData("fromHost")))
key = context.getData("keyOfValue");

if (!restictedData.hasOwnProperty(key)) {
    throw key + " not found in restictedData";
}

authenticationProperties = {};
authenticationProperties[context.getData("headerName")] = restictedData[key];

context.setAuthenticationPropertiesOnStep(context.getData("propertiesStoredOnStep"), 3600000, context.getData("propertyName"), JSON.stringify(authenticationProperties));
