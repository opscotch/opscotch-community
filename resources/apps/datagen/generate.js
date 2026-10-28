doc
    .description("Generates a random multiline POST body for data-generation tests.")
    .dataSchema({
        type: "object",
        properties: {
            batchSize: { type: ["string", "number"] }
        }
    })
    .run(() => {
        const BATCHSIZE = parseInt(context.getData("batchSize"));
        const CHARSET = ' abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        const EMPTYSTRING = '';
        const NEWLINE = '\n';
        const generateRandomString = (size) => Array.from({ length: size }, () => CHARSET[Math.floor(Math.random() * CHARSET.length)]).join(EMPTYSTRING);
        const generatePayload = (size) => Array.from({ length: size }, () => generateRandomString(100)).join(NEWLINE);
        context.setBody(generatePayload(100));
        context.setHttpMethod("POST");
    });
