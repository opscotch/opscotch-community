/*
Expects results from an elastic query.

Expects the following data properties:
- processroute : step to forward to

Will forward the hits.hits result
*/

body = context.getMessageBodyAsString();
response = JSON.parse(body);
context.sendToRoute(context.getData("processroute"), JSON.stringify(response.hits.hits));