doc
.inSchema({
    type : "object",
    required : [ "params" ],
    properties : {
        params : {
            type : "object",
            required : [ "name", "arguments" ],
            properties : {
                name : {
                    type : "string"
                },
                arguments : {
                    type : "object",
                    additionalProperties: true
                }
            }
        }
    }
    
})
.run(() => {
    context.setBody(JSON.stringify(JSON.parse(context.getBody()).params.arguments)); 
    console.log("x " +context.getBody());
});