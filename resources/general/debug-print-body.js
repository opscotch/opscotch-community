doc
    .description("Prints the current message body to the console for debugging.")
    .run(() => {
        console.log(context.getMessageBodyAsString());
    });
