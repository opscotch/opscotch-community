doc
    .dataSchema(
        {
            required : [ "setProperties" ],
            setProperties : {
                type : "array",
                items : {
                    type : "string"
                }
            }
        }
    )
    .run(() => {
        const properties = JSON.parse(context.getData("setProperties"));
        properties.forEach(property => context.setProperty(property, context.getData(property)));
    }) 