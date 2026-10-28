doc
    .description("Sets a POST URL to update an Elasticsearch document using an ID from a property or header.")
    .dataSchema({
        type: "object",
        required: ["host-ref", "index"],
        properties: {
            "host-ref": { type: "string" },
            index: { type: "string" },
            idproperty: { type: "string" },
            idheader: { type: "string" }
        }
    })
    .run(() => {
        let recordId = null;
        if (context.getData("idproperty") && context.getProperty(context.getData("idproperty"))) {
            recordId = context.getProperty(context.getData("idproperty"))
        } else {
            recordId = JSON.parse(context.getHeader(context.getData("idheader")))[0];
        }

        context.setUrl(context.getData("host-ref"), "/" + context.getData("index") + "/_update/" + recordId);
        context.setHttpMethod("POST");
    });
