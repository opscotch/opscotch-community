doc
    .description("Sets the message body from a restricted-host data value named by keyOfBody.")
    .dataSchema({
        type: "object",
        required: ["fromHost", "keyOfBody"],
        properties: {
            fromHost: { type: "string" },
            keyOfBody: { type: "string" }
        }
    })
    .run(() => {
        const data = JSON.parse(context.getData());
        const restictedData = JSON.parse(context.getRestrictedDataFromHost(data["fromHost"]))
        const key = data["keyOfBody"];

        if (!restictedData.hasOwnProperty(key)) {
            throw key + " not found in restictedData";
        }

        context.setMessage(restictedData[key]);
    });
