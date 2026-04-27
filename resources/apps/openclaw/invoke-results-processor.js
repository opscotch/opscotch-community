function parseJson(value, fallback) {
    if (value === null || value === undefined || value === "") {
        return fallback;
    }
    return JSON.parse(value);
}

var upstream = parseJson(context.getBody(), {});
context.setBody(JSON.stringify({
    queued: true,
    dispatcher: "openclaw-local-gateway",
    agent: String(context.getProperty("openclaw_agent") || ""),
    response: upstream
}));
