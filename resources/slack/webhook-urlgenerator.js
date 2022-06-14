// requires "slack-webhook-id" set on data

slackPath = "/services/" + context.getData("slack-webhook-id")
context.setUrl(context.getData("host-ref"), slackPath);