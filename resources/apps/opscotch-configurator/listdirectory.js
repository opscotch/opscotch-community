doc.inSchema({
    type : "object",
    required : [ "uri", "method", "path" ],
    properties : {
        uri : {
            type : "string"
        },
        method : {
            type : "string"
        },
        path : {
            type : "string"
        }
    }
}).dataSchema({
    type : "object",
    properties : {
        fileId : {
            type : "string"
        }
    }
})
.run(() => {
    var request = JSON.parse(context.getBody());
    console.log(request);
    console.log(context.files(context.getData("fileId")).list(request.path));
    context.setMessage(context.files(context.getData("fileId")).list(request.path));   
}).outSchema({
    type : "array",
    items : {
        type : "object",
        properties : {
            name : {
                type : "string"
            },
            type : {
                type : "string"
            }
        }
    }
});