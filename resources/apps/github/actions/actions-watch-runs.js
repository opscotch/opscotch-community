doc
    .description("Watch configured GitHub Actions workflows and route matching state changes to target deployment steps")
    .asUserErrors()
    .dataSchema({
        type: "object",
        required: ["githubActionWatcherCriteria"],
        properties: {
            githubActionWatcherCriteria: {
                type: "array",
                description: "List of watch criteria",
                minItems: 1,
                items: {
                    type: "object",
                    required: ["repo", "workflow_id", "state", "deploymentId", "stepId"],
                    properties: {
                        repo: { type: "string", description: "Owner/repo format" },
                        workflow_id: { type: "string", description: "Workflow file name or ID" },
                        state: { type: "string", description: "State to match (status:queued, conclusion:success, etc)" },
                        deploymentId: { type: "string", description: "Target deployment ID" },
                        stepId: { type: "string", description: "Target step ID" },
                        branch: { type: "string", description: "Filter by branch" },
                        event: { type: "string", description: "Filter by event type" },
                        per_page: { type: "integer", description: "Number of runs to fetch" }
                    }
                }
            }
        }
    })
    .outSchema({
        type: "object",
        description: "Watch cycle result",
        required: ["watched", "criteria_count", "notifications_sent", "notifications", "errors"],
        properties: {
            watched: { type: "boolean", description: "Whether criteria were configured" },
            reason: { type: "string", description: "Reason when not watched" },
            criteria_count: { type: "integer", description: "Number of criteria configured" },
            notifications_sent: { type: "integer", description: "Number of notifications sent" },
            notifications: {
                type: "array",
                description: "Sent notifications",
                items: {
                    type: "object",
                    properties: {
                        repo: { type: "string" },
                        workflow_id: { type: "string" },
                        state: { type: "string" },
                        run_id: { type: "integer" },
                        deploymentId: { type: "string" },
                        stepId: { type: "string" }
                    }
                }
            },
            errors: {
                type: "array",
                description: "Errors encountered",
                items: {
                    type: "object",
                    properties: {
                        index: { type: "integer" },
                        repo: { type: "string" },
                        workflow_id: { type: "string" },
                        run_id: { type: "integer" },
                        error: { type: "string" }
                    }
                }
            }
        }
    })
    .run(() => {
        function matchesState(state, run) {
            var wanted = state.toLowerCase();
            var status = run.status.toLowerCase();
            var conclusion = (run.conclusion || "").toLowerCase();

            if (wanted.indexOf("status:") === 0) return status === wanted.slice(7);
            if (wanted.indexOf("conclusion:") === 0) return conclusion === wanted.slice(11);

            return wanted === status || wanted === conclusion;
        }

        function criteriaKey(criteria) {
            return [
                criteria.repo,
                criteria.workflow_id,
                criteria.branch || "*",
                criteria.event || "*",
                criteria.state
            ].join("|");
        }

        function toEpochMs(value) {
            if (!value) return 0;
            var ms = Date.parse(value);
            if (isNaN(ms)) return 0;
            return ms;
        }

        var persistKey = "github-action-watcher.state";
        var data = JSON.parse(context.getData());
        var criteriaList = data.githubActionWatcherCriteria;

        if (criteriaList.length === 0) {
            context.setBody(JSON.stringify({ watched: false, reason: "no-criteria" }));
            return;
        }

        var existing = JSON.parse(context.getPersistedItem(persistKey) || "null") || { criteria: {} };
        if (!existing.criteria) {
            existing.criteria = {};
        }

        var notified = [];
        var criteriaErrors = [];

        for (var i = 0; i < criteriaList.length; i += 1) {
            var criterion = criteriaList[i];

            var listResponse = context.sendToStep("github-action-list-runs", JSON.stringify({
                operation: "list-workflow-runs",
                repo: criterion.repo,
                workflow_id: criterion.workflow_id,
                branch: criterion.branch,
                event: criterion.event,
                per_page: criterion.per_page
            }));

            var result = JSON.parse(listResponse.getBody());
            var runs = Array.isArray(result.runs) ? result.runs : [];
            var cKey = criteriaKey(criterion);
            var state = existing.criteria[cKey] || {
                watermark_updated_at: "",
                watermark_ts: 0,
                notified_run_ids_at_watermark: []
            };
            var watermarkTs = state.watermark_ts;
            var idsAtWatermark = state.notified_run_ids_at_watermark;
            var nextWatermarkTs = watermarkTs;
            var nextWatermarkUpdatedAt = state.watermark_updated_at;
            var nextIdsAtWatermark = idsAtWatermark.slice(0, 200);

            for (var r = 0; r < runs.length; r += 1) {
                var run = runs[r];
                if (!matchesState(criterion.state, run)) continue;

                var runId = run.id;
                var runUpdatedAt = run.updated_at;
                var runTs = toEpochMs(runUpdatedAt);
                if (runTs <= 0) continue;

                var shouldNotify = false;
                if (runTs > watermarkTs) {
                    shouldNotify = true;
                } else if (runTs === watermarkTs && idsAtWatermark.indexOf(runId) < 0) {
                    shouldNotify = true;
                }
                if (!shouldNotify) continue;

                var payload = {
                    notification_type: "github-action-state-change",
                    matched_state: criterion.state,
                    watched: {
                        repo: criterion.repo,
                        workflow_id: criterion.workflow_id,
                        branch: criterion.branch,
                        event: criterion.event,
                        logsToCollect: criterion.logsToCollect
                    },
                    run: {
                        id: runId,
                        run_number: run.run_number,
                        status: run.status,
                        conclusion: run.conclusion,
                        event: run.event,
                        head_branch: run.head_branch,
                        created_at: run.created_at,
                        updated_at: run.updated_at,
                        html_url: run.html_url
                    },
                    observed_at: context.getTimestamp()
                };

                try {
                    context.sendToStep(criterion.deploymentId, criterion.stepId, JSON.stringify(payload));
                    if (runTs > nextWatermarkTs) {
                        nextWatermarkTs = runTs;
                        nextWatermarkUpdatedAt = runUpdatedAt;
                        nextIdsAtWatermark = [runId];
                    } else if (runTs === nextWatermarkTs && nextIdsAtWatermark.indexOf(runId) < 0) {
                        nextIdsAtWatermark.push(runId);
                        if (nextIdsAtWatermark.length > 200) {
                            nextIdsAtWatermark = nextIdsAtWatermark.slice(nextIdsAtWatermark.length - 200);
                        }
                    }
                    notified.push({
                        repo: criterion.repo,
                        workflow_id: criterion.workflow_id,
                        state: criterion.state,
                        run_id: runId,
                        deploymentId: criterion.deploymentId,
                        stepId: criterion.stepId
                    });
                } catch (err3) {
                    criteriaErrors.push({
                        index: i,
                        repo: criterion.repo,
                        workflow_id: criterion.workflow_id,
                        run_id: runId,
                        error: "notify failed: " + String(err3 && err3.message ? err3.message : err3)
                    });
                }
            }

            existing.criteria[cKey] = {
                watermark_updated_at: nextWatermarkUpdatedAt,
                watermark_ts: nextWatermarkTs,
                notified_run_ids_at_watermark: nextIdsAtWatermark
            };
        }

        context.setPersistedItem(persistKey, JSON.stringify(existing));
        context.setBody(JSON.stringify({
            watched: true,
            criteria_count: criteriaList.length,
            notifications_sent: notified.length,
            notifications: notified,
            errors: criteriaErrors
        }));
    });
