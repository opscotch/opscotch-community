doc.inSchema({
    type : "object",
    required : [ "path" ],
    properties : {
        path : {
            type : "string"
        }
    }
})
.run(() => {
    var request = JSON.parse(context.getMessageBodyAsString());
    console.log(context.getMessageBodyAsString());
    context.setMessage(context.files(context.getData("fileId")).read(request.path));   
});