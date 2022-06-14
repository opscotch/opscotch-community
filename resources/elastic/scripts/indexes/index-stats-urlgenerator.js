body = context.getMessageBodyAsString();
response = JSON.parse(body);
data = JSON.parse(context.getData());
context.setUrl(data["host-ref"], '/' + response.index + '/_stats');