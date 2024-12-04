doc.fromSchema({
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
    var request = JSON.parse(context.getPassedMessageAsString());
    context.setMessage(context.files(context.getData("fileId")).list());   
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