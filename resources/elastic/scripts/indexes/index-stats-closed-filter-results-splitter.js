
body = context.getMessageBodyAsString();
response = JSON.parse(body);

response.forEach(item => {
    if(item.status == "open") context.addSplitReturnItem(JSON.stringify(item))
});
