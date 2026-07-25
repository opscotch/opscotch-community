doc
  .description("Forward an administrative key-store load request to the local validator")
  .run(() => {
    const request = JSON.parse(context.getBody());
    context.removeAllHeaders();
    const response = context.sendToStep(
      "accept-key-store-admin",
      request.body
    );

    if (response.isErrored()) {
      const message = response.getAllErrors()[0];
      if (message.indexOf("key already exists") >= 0) {
        context.setProperty("status_code", 409);
        context.setHeader("content-type", "application/json");
        context.setBody(JSON.stringify({ error: "key already exists" }));
        return;
      }
      if (message.indexOf("No oneOf passed") >= 0
        || message.indexOf("secret seed required") >= 0
        || message.indexOf("key record integrity failure") >= 0) {
        context.setProperty("status_code", 400);
        context.setHeader("content-type", "application/json");
        context.setBody(JSON.stringify({ error: "invalid key-store load request" }));
        return;
      }
      throw new Error(message);
    }

    context.setProperty("status_code", 201);
    context.setHeader("content-type", "application/json");
    context.setBody(response.getBody());
  });
