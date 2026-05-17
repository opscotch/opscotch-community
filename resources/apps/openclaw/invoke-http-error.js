var statusCode = String(context.getProperty("status_code") || "unknown");
var responseBody = context.getBody() || "";
var agent = String(context.getProperty("openclaw_agent") || "");

context.addSystemError("OpenClaw invoke failed with status " + statusCode + (agent ? " for agent " + agent : ""));
context.setBody(JSON.stringify({
    queued: false,
    status_code: statusCode,
    agent: agent,
    response: responseBody
}));
