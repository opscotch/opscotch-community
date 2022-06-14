/*
Takes an object and a json path to a dictionary and splits each dictionary value, passing it through the payload and url generation pipeline.
The results of each request are collected and processes together

"splitGenerator": {
    "resource": "/routes/general/standard-json-dict-values-aggregator-split.js",
    "data" : {
      "path" : "some.path.to.dict"
    }
 }
*/

body = context.getMessageBodyAsString();
response = JSON.parse(body);

function fromKey(keyArray, data) {
    if(keyArray.length == 1) {
        return data[keyArray[0]];
    } else {
        return fromKey(keyArray.slice(1), data[keyArray[0]]);
    }
}

dictionary = fromKey(context.getData("path").split("."), response);
Object.keys(dictionary).forEach(key => context.addSplitReturnItem(JSON.stringify(dictionary[key])));
