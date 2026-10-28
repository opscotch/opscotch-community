doc
    .description("Sets a message header from a restricted-host data value named by keyOfValue.")
    .dataSchema({
        type: "object",
        required: ["fromHost", "keyOfValue", "headerName"],
        properties: {
            fromHost: { type: "string" },
            keyOfValue: { type: "string" },
            headerName: { type: "string" }
        }
    })
    .run(() => {
        const restictedData = JSON.parse(context.getRestrictedDataFromHost(context.getData("fromHost")))
        const key = context.getData("keyOfValue");

        if (!restictedData.hasOwnProperty(key)) {
            throw key + " not found in restictedData";
        }

        context.setHeader(context.getData("headerName"), restictedData[key]);
    });
