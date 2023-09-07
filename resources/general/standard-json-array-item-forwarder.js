/*
Fetches data from one url and forwards EACH object in the response to another route
which will likely mix this data with another source

example config:

{
    "enabled" : true,
    "type" : "scripted",
    "stepId" : "appd-analytics-application-collect",
    "urlGenerator" : "/controller/rest/applications?httpMethod=GET&output=JSON",
    "resultsProcessor" : {
      "resource" :  "/routes/appdmetric/scripts/general/forward-resultprocessor.js",
      "data" : {
        "processroute" : "appd-analytics-application-analytics-collect"
      },
    }
    "trigger": { "timer" : { "period" : 60000 }}
}
*/

body = context.getMessageBodyAsString();
console.log(body);
response = JSON.parse(body);

response.forEach(item => context.sendToStep(context.getData("processroute"), JSON.stringify(item)))
