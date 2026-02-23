doc
    .inSchema(
        {
            required : [ "key", "value" ],
            properties : {
                currentVersion : {
                    type : ["string", "null"]
                },
                key : {
                    type : "string"
                },
                value : {
                    type : "string"
                }
            }
        }
    )
    .dataSchema(
        {
            required : [ "tableName", "keyField", "keyFieldType", "valueType"],
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

        const input = JSON.parse(context.getBody());
        const currentVersion = input.currentVersion;
        const nextVersion = parseInt(currentVersion) + 1;

        /*
        Expected body format:

        if there is no current version (new)

        {
            "TableName": "test-persistence3",
            "Item": {
                "k": { "S": "example" },
                "v": { "S": "value" },
                "version": { "N": "0" }
            },
            "ConditionExpression": "attribute_not_exists(k)"
        }

        {
            "TableName": "kv_store",
            "Item": {
                "k": { "S": "license:family123" },
                "v": { "S": "{\"remaining\":41}" },
                "version": { "N": "8" }
            },
            "ConditionExpression": "version = :expected",
            "ExpressionAttributeValues": {
                ":expected": { "N": "7" }
            }
        }
        */
        const body = {
            TableName : tableName,
            Item : {
                v : {},
                version : {
                    N : `${nextVersion}`
                }
            }
        };

        if (currentVersion) {
            body.ConditionExpression =  "version = :expected",
            body.ExpressionAttributeValues = {
                ":expected": { "N": `${currentVersion}` }
            }
        } else {
            body.ConditionExpression = "attribute_not_exists(k)"
        }

        body.Item.v[context.getData("valueType")] = input.value;

        const key = {};
        key[context.getData("keyFieldType")] = input.key;        
        body.Item[context.getData("keyField")] = key;

        const ddbResponse = context.sendToStep(
            awsServices, 
            "dynamodb-request",
            JSON.stringify(
                {
                    operationName : "PutItem",
                    body : body
                }
            )
        );

        const status = ddbResponse.getProperty("status");
        context.setProperty("status", status);

        if (status == "400") {
            context.setBody(ddbResponse.getBody())
        } else {
            context.setProperty("version", nextVersion);
        }
    });