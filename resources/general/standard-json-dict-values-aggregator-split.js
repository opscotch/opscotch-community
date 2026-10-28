doc
    .description("Splits each value from a nested dictionary path in a JSON body into split return items.")
    .dataSchema({
        type: "object",
        required: ["path"],
        properties: {
            path: { type: "string" }
        }
    })
    .inSchema({
        type: "object"
    })
    .run(() => {
        const body = context.getMessageBodyAsString();
        const response = JSON.parse(body);

        function fromKey(keyArray, data) {
            if (keyArray.length == 1) {
                return data[keyArray[0]];
            } else {
                return fromKey(keyArray.slice(1), data[keyArray[0]]);
            }
        }

        const dictionary = fromKey(context.getData("path").split("."), response);
        Object.keys(dictionary).forEach(key => context.addSplitReturnItem(JSON.stringify(dictionary[key])));
    });
