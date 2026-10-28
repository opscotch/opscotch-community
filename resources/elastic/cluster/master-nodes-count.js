doc
    .description("Counts master-eligible Elasticsearch nodes from a /_cat/nodes JSON response and forwards the count.")
    .dataSchema({
        type: "object",
        required: ["processroute"],
        properties: {
            processroute: { type: "string" }
        }
    })
    .inSchema({
        type: "array",
        items: {
            type: "object",
            properties: {
                role: { type: "string" }
            }
        }
    })
    .run(() => {
        const body = context.getMessageBodyAsString();
        const nodeList = JSON.parse(body);

        let masterEligibleNodes = 0;
        nodeList.forEach(obj => {
            const role = obj["role"];
            if (role.includes("m")) {
                masterEligibleNodes++;
            }
        });
        const item = { "master-eligible-nodes": masterEligibleNodes };

        context.sendToStep(context.getData("processroute"), JSON.stringify(item))
    });
