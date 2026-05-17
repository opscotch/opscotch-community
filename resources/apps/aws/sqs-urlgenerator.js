doc
    .inSchema(
        {
            type : "object",
            required : [ "aws_sqs_queue" ],
            properties : {
                aws_sqs_queue : {
                    type : "string"
                }
            }
        }
    )
    .dataSchema(
        {
            type : "object",
            required : [ "awsAccount" ],
            properties : {
                awsAccount : {
                    type : "string"
                }
            }
        }
    ).run(() => {
        const uri = `/${context.getData("awsAccount")}/${JSON.parse(context.getBody()).aws_sqs_queue}`;
        context.setUrl("sqs", uri);
        context.setProperty("uri", uri)
    });