doc
    .dataSchema({
        type : "object",
        required: [ "authorizationHeaders" ],
        properties : {
            authorizationHeaders : {
                type : "object",
                required : [ "basic" ], 
                properties : {
                    basic : {
                        type : "object",
                        required : [ "values"],
                        properties : {
                            values : {
                                type : "array",
                                items : {
                                    type : "string"
                                }
                            }
                        }
                    }
                }
            }
        }
    })
    .run(() => {

        let basicAuth = JSON.parse(context.getHeader("Authorization")).find(s => s.trim().toLowerCase().startsWith("basic")).replace(/basic/i, "").trim();
        
        if ( ! basicAuth || ! JSON.parse(context.getData("authorizationHeaders"))
            .basic
            .values
            .find(s => s == basicAuth) ) 
        {
            context.setProperty("status_code", 401);
            context.setBody("");
            context.setStream(null);
            context.end();
        }

    });