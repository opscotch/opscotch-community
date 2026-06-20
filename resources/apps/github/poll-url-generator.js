doc
    .description("Build a GitHub polling URL from one watcher repo group")
    .asUserErrors()
    .dataSchema({
        type: "object",
        additionalProperties: true,
        required: ["hostId"],
        properties: {
            hostId: {
                description: "Bootstrap host id for GitHub API access.",
                type: "string",
                minLength: 1
            },
            issueWatcherDecisionLoggingEnabled: {
                description: "When true, emits diagnostic logs for watcher polling URL generation.",
                type: "boolean"
            }
        }
    })
    .inSchema({
        type: "object",
        required: ["repo", "assignee", "watchEntity", "criteria"],
        additionalProperties: true,
        properties: {
            repo: {
                description: "GitHub repository in owner/repo format.",
                type: "string",
                minLength: 3,
                pattern: "^[^/]+\\/[^/]+$"
            },
            assignee: {
                description: "GitHub assignee login to poll.",
                type: "string",
                minLength: 1
            },
            watchEntity: { type: "string", enum: ["issue", "pr"] },
            criteria: {
                description: "Routing criteria for this repo and assignee poll group.",
                type: "array",
                minItems: 1,
                items: {
                    type: "object",
                    additionalProperties: true,
                    required: ["label", "deploymentId", "stepId"],
                    properties: {
                        label: { type: "string", minLength: 1 },
                        deploymentId: { type: "string", minLength: 1 },
                        stepId: { type: "string", minLength: 1 }
                    }
                }
            }
        }
    })
    .run(() => {
        var data = JSON.parse(context.getData());
        var group = JSON.parse(context.getBody());
        var decisionLoggingEnabled = data.issueWatcherDecisionLoggingEnabled ?? false;
        var hostId = data.hostId.trim();
        var repo = group.repo.trim();
        var assignee = group.assignee.trim();
        var watchEntity = group.watchEntity;
        var criteria = group.criteria;

        if (watchEntity !== "issue" && watchEntity !== "pr") {
            throw new Error("watchEntity must be either issue or pr");
        }

        var labels = [];
        for (var i = 0; i < criteria.length; i += 1) {
            var label = criteria[i].label.trim();
            if (labels.indexOf(label) < 0) {
                labels.push(label);
            }
        }

        var query = "state=open"
            + "&assignee=" + encodeURIComponent(assignee)
            + "&sort=updated"
            + "&direction=asc"
            + "&per_page=100";
        var path = "/repos/" + repo + "/issues?" + query;

        if (decisionLoggingEnabled) {
            var details = {
                host_id: hostId,
                watch_entity: watchEntity,
                repo: repo,
                assignee: assignee,
                labels: labels,
                label_filter_mode: "or-in-results-processor",
                path: path,
                criteria_count: criteria.length
            };
            var message = "github-watcher url poll-request-built: " + JSON.stringify(details);
            if (typeof context.diagnosticLog === "function") {
                context.diagnosticLog(message);
            } else {
                console.log(message);
            }
        }

        context.setHttpMethod("GET");
        context.setUrl(hostId, path);
        context.setHeader("Accept", "application/vnd.github+json");
        context.setHeader("X-GitHub-Api-Version", "2022-11-28");
        context.setProperty("gh_poll_group", JSON.stringify({
            repo: repo,
            assignee: assignee,
            watchEntity: watchEntity,
            criteria: criteria
        }));
    });
