doc
    .description("Splits a newline-delimited message body into individual split return items.")
    .run(() => {
        context.diagnosticLog(context.getMessageBodyAsString());
        context.getMessageBodyAsString().split("\n").forEach(line => context.addSplitReturnItem(line));
    });
