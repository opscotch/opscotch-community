doc
    .description("Sets the message body from the step data value named by keyOfBody.")
    .dataSchema({
        type: "object",
        required: ["keyOfBody"],
        properties: {
            keyOfBody: { type: "string" }
        }
    })
    .run(() => {
        const data = JSON.parse(context.getData());
        if (!data.hasOwnProperty("keyOfBody")) {
            throw "keyOfBody not found in data";
        }

        const key = data["keyOfBody"];

        if (!data.hasOwnProperty(key)) {
            throw key + " not found in data";
        }

        context.setMessage(JSON.stringify(data[key]));
    });
