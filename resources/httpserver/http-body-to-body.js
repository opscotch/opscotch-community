doc
.description("Unwraps the HTTP request body")
.inSchema({
    type : "object",
    required : [ "body" ],
    properties : {
        body : {
            type : "string"
        }
    }
})
.run(() => {
    context.setBody(JSON.parse(context.getBody()).body);
})