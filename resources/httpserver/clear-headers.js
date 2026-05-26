doc
    .description("Clears all inbound headers from the current context to prevent accidental header propagation.")
    .run(() => {
        context.removeAllHeaders();
    });
