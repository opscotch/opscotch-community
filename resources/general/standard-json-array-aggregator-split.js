/*
Takes an array and splits each item, passing it through the payload and url generation pipeline.
The results of each request are collected and processes together
*/

body = context.getMessageBodyAsString();
response = JSON.parse(body);

response.forEach(item => context.addSplitReturnItem(JSON.stringify(item)))
