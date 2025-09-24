var payload = context.getBody();
var q = context.queue();

if (payload) {
    q.push(payload);
    context.end();
} else {
    // timer

    payload = q.take(1);
    while(payload[0]) {
        payload = payload[0];
        context.diagnosticLog(`forwarding: ${payload}`);
        var returnedState = context.sendToStep("forwarder", payload);
        if (returnedState.isErrored()) {
            context.diagnosticLog(`forwarding errored`);
            q.returnItem(payload);
            context.end();
        }
        payload = q.take(1);
    }
}
