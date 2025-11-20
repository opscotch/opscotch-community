var addHeaders = context.getData("addHeaders");
if (addHeaders) {
    addHeaders = JSON.parse(addHeaders);
    for (const header of addHeaders) {
        context.setHeader(header, context.getData(header));
    }
} else {
    context.setHeader("Access-Control-Allow-Origin", "*");
}
