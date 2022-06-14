/*
Given a key to some data, and a restricted host, sets the data as the message body

{
    "data" : {
        "fromHost" : "theHost",
        "keyOfBody" : "myBody"
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
data = JSON.parse(context.getData());
restictedData = JSON.parse(context.getRestrictedDataFromHost(data["fromHost"]))
key = data["keyOfBody"];

if (!restictedData.hasOwnProperty(key)) {
    throw key + " not found in restictedData";
}

context.setMessage(restictedData[key]);