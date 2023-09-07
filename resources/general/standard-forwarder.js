/*
Fetches data from one url and forward the response to another route
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
      }
    },
    "trigger": { "timer" : { "period" : 60000 }}
}
*/

body = context.getMessageBodyAsString();
context.sendToStep(context.getData("processroute"), body)
