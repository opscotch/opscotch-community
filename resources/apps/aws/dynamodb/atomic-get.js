doc
    .inSchema(
        {
            type : "string",
            description : "Key to get"
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
        const value = context.getBody();

        /*
        Expected body format:

        {
            "TableName": "kv_store",
            "Key": {
                "k": { "S": "license:family123" }
            },
            "ConsistentRead": true
        }
        */
        const body = {
            TableName : tableName,
            ConsistentRead : true,
            Key : {}
        };
        const key = {};
        key[context.getData("keyFieldType")] = value;
        body.Key[context.getData("keyField")] = key;

        const ddbResponse = JSON.parse(context.sendToStep(
            awsServices, 
            "dynamodb-request",
            JSON.stringify(
                {
                    operationName : "GetItem",
                    body : body
                }
            )
        ).getBody());

        if (ddbResponse.Item) {
            context.setProperty("version", ddbResponse.Item.version.N);
            context.setBody(ddbResponse.Item.v[context.getData("valueType")]);
        } else {
            context.setBody(null);
        }

    });