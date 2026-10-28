doc
    .description("No-op payload generator that allows a forwarded message to be sent when a payload generator is required.")
    .run(() => {
        // If you don't supply a payload generator the passed message is NOT forwarded by default.
        // However if you do provide a results processor, even if it does nothing,
        // the forwarded message IS SENT.
    });
