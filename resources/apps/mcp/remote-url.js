doc
.inSchema({
    type : "object",
    required : [ "host" ],
    properties : {
        host : {
            type : "object",
            required : [ "hostref", "path" ],
            properties : {
                hostref : {
                    type : "string"    
                },
                path : {
                    type : "string"
                }
            }
        }
    }
})
.run(() => {
    const input = JSON.parse(context.getBody());
    context.setUrl(input.host.hostref, input.host.path); 
});