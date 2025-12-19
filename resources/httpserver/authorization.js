doc
    .description("Optional basic authorization handling. To activate, define the authorizationHeaders object in data.")
    .dataSchema({
        type : "object",
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

        if (context.getData("authorizationHeaders")) {
            let basicAuth = JSON.parse(context.getHeader("Authorization")).find(s => s.trim().toLowerCase().startsWith("basic"));
            
            if ( ! basicAuth || ! JSON.parse(context.getData("authorizationHeaders"))
                .basic
                .values
                .find(s => s == basicAuth.replace(/basic/i, "").trim()) ) 
            {
                context.setProperty("status_code", 401);
                context.setBody("");
                context.setStream(null);
                context.end();
            }
        }
        
    });