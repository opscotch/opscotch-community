/*
Fetches data from one url and forward the response to another route
which will likely mix this data with another source

example config:

{
    "enabled" : true,
    "type" : "scripted",
    "routeName" : "appd-analytics-application-collect",
    "urlGenerator" : "/controller/rest/applications?httpMethod=GET&output=JSON",
    "noDateRange" : true,
    "resultsProcessor" : {
      "resource" :  "/routes/appdmetric/scripts/general/forward-resultprocessor.js",
      "data" : {
        "processroute" : "appd-analytics-application-analytics-collect"
      }
    },
    "timer" : "fixedRate=true&period=60000"
}
*/

body = context.getMessageBodyAsString();
context.sendToRoute(context.getData("processroute"), body)
