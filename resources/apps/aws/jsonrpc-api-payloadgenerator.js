doc
    .inSchema(
        {
            type : "object",
            required : [ "operationName", "body" ],
            properties : {
                operationName : {
                    type : "string"
                },
                body : {
                    type : "object"
                }
            }
        }
    )
    .dataSchema(
        {
            type : "object",
            required : [ "json_rpc_version", "json_rpc_target_prefix" ],
            properties : {
                json_rpc_version : {
                    type : "string"
                },
                json_rpc_target_prefix : {
                    type : "string"
                }
            }
        }
    )
    .run(() => {
        const input = JSON.parse(context.getBody());
        context.removeAllHeaders(); 
        context.setHttpMethod("POST"); 
        context.setProperty("method", "POST");
        context.setHeader("Content-Type", "application/x-amz-json-" + context.getData("json_rpc_version"));
        context.setHeader("x-amz-target", `${context.getData('json_rpc_target_prefix')}.${input.operationName}`);
        context.setBody(JSON.stringify(input.body));
    });