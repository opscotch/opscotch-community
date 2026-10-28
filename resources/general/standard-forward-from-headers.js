doc
    .description("Forwards the body to a route from data, property, or header, copying configured headers.")
    .dataSchema({
        type: "object",
        required: ["headersToCopy"],
        properties: {
            headersToCopy: {
                type: "array",
                items: { type: "string" }
            },
            processrouteHeader: { type: "string" },
            processrouteProperty: { type: "string" },
            processrouteData: { type: "string" }
        }
    })
    .run(() => {
        const headers = {}

        if (!context.getData("headersToCopy")) {
            throw "Data property headersToCopy was expected and not found";
        }

        const headersToCopy = JSON.parse(context.getData("headersToCopy")).forEach(header => {
            const value = context.getHeader(header);
            if (value && value != "[]") {
                headers[header] = JSON.parse(context.getHeader(header))[0];
            } else {
                throw "Header " + header + " was expected and not found";
            }
        });

        if (!context.getData("processrouteHeader") && !context.getData("processrouteProperty") && !context.getData("processrouteData")) {
            throw "Data property processrouteHeader or processrouteProperty or processrouteData was expected and not found"
        }

        context.sendToStep(context.getData("processrouteData") ?? (context.getProperty(context.getData("processrouteProperty")) ?? JSON.parse(context.getHeader(context.getData("processrouteHeader")))[0]), context.getMessageBodyAsString(), headers);
    });
