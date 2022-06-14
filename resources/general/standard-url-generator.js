data = JSON.parse(context.getData());
context.setUrl(data["host-ref"], data["path"]);