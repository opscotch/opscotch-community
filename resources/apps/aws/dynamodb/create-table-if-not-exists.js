doc
    .dataSchema(
        {
            required : [ "tableName", "tableSchema" ],
            properties : {
                awsServicesId : {
                    type : "string"
                },
                tableName : {
                    type : "string"
                },
                tableSchema : {
                    type : "object"
                }
            }
        }
    )
    .run(() => {

        const awsServices = context.getData("awsServicesId") ?? "aws-services" ;
        const tableName = context.getData("tableName");
        const statusName = `${tableName}-status`;

        let status = context.getStepProperties().get(statusName);
        if ( status ) {
            context.setProperty("status", status);
            context.end();
        }

        context.diagnosticLog(`Checking for table ${tableName}`);

        const describeTable = () => {
            return context.sendToStep(
                awsServices, 
                "dynamodb-request", 
                JSON.stringify( 
                    {
                        operationName : "DescribeTable",
                        body : { 
                            TableName : tableName 
                        } 
                    }
                )
            );
        }

        let ddbResponse = describeTable();
        if (ddbResponse.getProperty("status_code")+ "" == "400") {
            status = "init-create";
            context.getStepProperties().put(statusName, status);
            const tableSchema = JSON.parse(context.getData("tableSchema"));
            tableSchema.TableName = tableName;

            ddbResponse = context.sendToStep(
                awsServices, 
                "dynamodb-request",
                JSON.stringify(
                    {
                        operationName : "CreateTable",
                        body : tableSchema
                    }
                )
            );
        }

        const response = JSON.parse(ddbResponse.getBody());

        const tableStatus = (response.TableDescription ? response.TableDescription : response.Table).TableStatus;

        if (tableStatus == "ACTIVE") {
            status = "ready"; 
            context.getStepProperties().put(statusName, status);
            context.diagnosticLog(`Table ready: ${tableName}`) 
        }

        context.setProperty("status", status);
    });