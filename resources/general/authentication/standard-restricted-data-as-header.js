/*
Given a key to some data, and a restricted host, sets the data as a message header

{
    "data" : {
        "fromHost" : "theHost",
        "keyOfValue" : "myBody",
        "headerName" : "myHeader"
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

context.setHeader(context.getData("headerName"), restictedData[key]);