
context.setProperty("awsRequestId", JSON.parse(context.getHeader("Lambda-Runtime-Aws-Request-Id"))[0]);

console.log(context.getData());

let response;
if (context.getData('lambda-event-processor-deploymentId') == "_test_") {
    response = context.sendToStep(context.getData('lambda-event-processor-stepId'), context.getBody());
} else {
    response = context.sendToStep(context.getData('lambda-event-processor-deploymentId'), context.getData('lambda-event-processor-stepId'), context.getBody());
}

if (response.isErrored()) {
    context.setProperty("responseType", "error");
    context.sendToStep("lambda-listener-response", JSON.stringify(
        {
            errorMessage : response.getAllErrors()[0],
            errorType : "Exception"
        }
    ));
} else {
    context.setProperty("responseType", "response");
    context.sendToStep("lambda-listener-response", "{}");
}


