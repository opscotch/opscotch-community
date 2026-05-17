doc.inSchema({
    type : "object",
    required : [ "path", "body" ],
    properties : {
        path : {
            type : "string"
        },
        body : {
            type : "string"
        }
    }
}).dataSchema({
    type : "object",
    required : [ "fileId" ],
    properties : {
        fileId : {
            type : "string"
        }
    }
})
.run(() => {
    var request = JSON.parse(context.getMessageBodyAsString());
    var body = request.body;
    context.setBody(body);
    context.files(context.getData("fileId")).write(request.path, body);   
});
