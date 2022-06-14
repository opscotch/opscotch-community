/*
Given a key to some data, sets the data as the message body

{
    "data" : {
        "keyOfBody" : "myBody",
        "myBody" : "here is some data"
    }
}

*/

data = JSON.parse(context.getData());
if (!data.hasOwnProperty("keyOfBody")) {
    throw "keyOfBody not found in data";
}

key = data["keyOfBody"];

if (!data.hasOwnProperty(key)) {
    throw key + " not found in data";
}

context.setMessage(JSON.stringify(data[key]));
