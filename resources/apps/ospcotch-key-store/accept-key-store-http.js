doc
  .description("Forward an HTTP key-store request to the key-store deployment")
  .run(() => {
    const request = JSON.parse(context.getBody());
    context.removeAllHeaders();
    const response = context.sendToStep(
      "key-store-call",
      "accept-key-store",
      request.body
    );

    if (response.isErrored()) {
      const message = response.getAllErrors()[0];
      const clientError = message.indexOf("key not found") >= 0
        || message.indexOf("No oneOf passed") >= 0
        || message.indexOf("key record integrity failure") >= 0
        || message.indexOf("incomplete key pair") >= 0
        || message.indexOf("unsupported operation") >= 0
        || message.indexOf("secret seed required") >= 0;
      if (clientError) {
        context.setProperty("status_code", 400);
        context.setHeader("content-type", "application/json");
        context.setBody(JSON.stringify({
          error: message.indexOf("key not found") >= 0
            ? "key not found"
            : message.indexOf("key record integrity failure") >= 0
              ? "key record integrity failure"
              : "invalid key-store request"
        }));
        return;
      }
      throw new Error(message);
    }

    context.setHeader("content-type", "application/json");
    context.setBody(response.getBody());
  });
