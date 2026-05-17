doc
    .dataSchema(
        {
            type : "object",
            required : [ "aws_query_api_version" ],
            properties : {
                aws_query_api_version : {
                    type : "string"
                }
            }
        }
    )
    .inSchema(
        {
            type : "object",
            required : [ "action" ],
            properties : {
                action : {
                    type : "string"
                },
                params : {
                    type : "object",
                    additionalProperties : {
                        type: "string"
                    }
                }
            }
        }
    )
    .run(() => {
        const awsEncode = (v) => encodeURIComponent(v).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
        
        const input = JSON.parse(context.getBody());
        context.removeAllHeaders(); 
        context.setHttpMethod("POST"); 
        context.setProperty("method", "POST");
        context.setHeader("Content-Type", "application/x-www-form-urlencoded; charset=utf-8");
        
        let params = "";

        if (input.params) {
            params = Object
            .entries(input.params)
            .filter(([, value]) => value !== null && value !== undefined && value !== "")
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `&${awsEncode(key)}=${awsEncode(value)}`)
            .join("");
        }

        context.setBody(
            `Action=${awsEncode(input.action)}` +
            `&Version=${awsEncode(context.getData("aws_query_api_version"))}` +
            params
        );
    });