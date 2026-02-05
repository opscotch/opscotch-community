const arid = JSON.parse(context.getHeader("Lambda-Runtime-Aws-Request-Id"))[0];
context.removeHeader("Lambda-Runtime-Aws-Request-Id");
context.setProperty("awsRequestId", arid);
context.diagnosticLog(`arid ${arid}`);

let response;
const deploymentId = context.getData('lambda-event-processor-deploymentId');
const step = context.getData('lambda-event-processor-stepId');
const body = context.getBody();
if ("_test_" == deploymentId) {
    response = context.sendToStep(step, body);
} else if (deploymentId && step) {
    response = context.sendToStep(deploymentId, step, body);
} else {
    context.diagnosticLog(body);
}

if (response && response.isErrored()) {
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
