data = JSON.parse(context.getData());
context.setUrl(data["host-ref"], data["path"]);
if (data["method"]) {
    context.setHttpMethod(data["method"].toUpperCase());
}