doc
    .description("Clears the current message body.")
    .run(() => {
        context.setMessage("");
    });
