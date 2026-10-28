doc
    .description("Stores the Jira ticket key from a create-ticket JSON response in OPSCOTCH_phmActionReference.")
    .inSchema({
        type: "object",
        properties: {
            key: { type: "string" }
        }
    })
    .run(() => {
        const body = context.getMessageBodyAsString();
        const jiraTicket = JSON.parse(body);
        if (jiraTicket.key)
            context.setProperty("OPSCOTCH_phmActionReference", jiraTicket.key);
    });
