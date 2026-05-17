doc
    .inSchema(
        {
            type : "array",
            items : {
                type : "string"
            },
            description : "List of keys to get"
        }
    )
    .dataSchema(
        {
            required : [ "tableName", "keyField", "keyFieldType" ],
            properties : {
                awsServicesId : {
                    type : "string"
                },
                tableName : {
                    type : "string"
                },
                keyField : {
                    type : "string"
                },
                keyFieldType : {
                    type : "string"
                },
                valueType : {
                    type : "string"
                }
             }
        }
    )
    .run(() => {

        const tableStaus = context.sendToStep("table-check", null).getProperty("status");
        if (tableStaus != "ready") {
            throw `table not ready`;
        }

        const awsServices = context.getData("awsServicesId") ?? "aws-services" ;
        const tableName = context.getData("tableName");
        const keys = JSON.parse(context.getBody());
        const keyField = context.getData("keyField");
        const keyFieldType = context.getData("keyFieldType");
        const valueType = context.getData("valueType");

        /*
        Expected body format:

        {
            "RequestItems": {
                "kv_store": {
                    "Keys": [
                        { "k": { "S": "example1" } },
                        { "k": { "S": "example2" } },
                        { "k": { "S": "example3" } }
                    ],
                    "ConsistentRead": true
                }
            }
        }

        */
        const body = {
            RequestItems : {}
        };

        body.RequestItems[tableName] = {
            Keys : [],
            ConsistentRead: true
        }
        
        keys.forEach(value => {
            const keyValue = {};
            keyValue[keyFieldType] = value;

            const key = {};
            key[keyField] = keyValue;

            body.RequestItems[tableName].Keys.push(key);
        });

        const ddbResponse = JSON.parse(context.sendToStep(
            awsServices, 
            "dynamodb-request",
            JSON.stringify(
                {
                    operationName : "BatchGetItem",
                    body : body
                }
            )
        ).getBody());

        if (ddbResponse.Responses[tableName]) {

            const responses = {}

            ddbResponse.Responses[tableName].forEach(item => {

                const key = item[keyField][keyFieldType];
                const value = item.v[valueType];

                responses[key] = {
                    value : value,
                    version : item.version.N
                }

            });

            console.log(JSON.stringify(responses));
            context.setBody(JSON.stringify(responses));
        } else {
            context.setBody("{}");
        }
    });