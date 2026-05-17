doc
    .description("Fetch and slice GitHub Actions logs for a specific step window")
    .asUserErrors()
    .inSchema({
        type: "object",
        required: [
            "repo",
            "run_id",
            "job_id",
            "step_name",
            "step_started_at",
            "step_completed_at",
            "log_fetch_deployment_access_id",
            "log_fetch_step_id"
        ],
        properties: {
            repo: { type: "string", description: "Owner/repo format" },
            run_id: { type: "number", description: "Workflow run id" },
            job_id: { type: "number", description: "Workflow job id" },
            step_name: { type: "string", description: "GitHub step name" },
            step_number: { type: "number", description: "GitHub step number" },
            step_started_at: { type: "string", description: "Step start timestamp (ISO8601)" },
            step_completed_at: { type: "string", description: "Step completion timestamp (ISO8601)" },
            log_fetch_deployment_access_id: { type: "string", description: "Deployment access id for external log-fetch step" },
            log_fetch_step_id: { type: "string", description: "Step id for external log-fetch step" }
        }
    })
    .outSchema({
        type: "object",
        required: ["status", "operation", "repo", "run_id", "job_id", "step_name", "step_log_lines"],
        properties: {
            status: { type: "string" },
            operation: { type: "string" },
            repo: { type: "string" },
            run_id: { type: "number" },
            job_id: { type: "number" },
            step_name: { type: "string" },
            step_number: { type: "number" },
            step_started_at: { type: "string" },
            step_completed_at: { type: "string" },
            logs_redirect_url: { type: "string" },
            step_log_lines: {
                type: "array",
                items: {
                    type: "object",
                    required: ["log", "line_number", "milliseconds_since_first_true_log"],
                    properties: {
                        log: { type: "string" },
                        line_number: { type: "number" },
                        milliseconds_since_first_true_log: { type: "number" }
                    }
                }
            },
            synthetic_summary: { type: "string" },
            exit_code: { type: "number" }
        }
    })
    .run(() => {
        function assertString(value) {
            if (typeof value !== "string") {
                throw new Error("setBody expected string, received " + (value === null ? "null" : Array.isArray(value) ? "array" : typeof value));
            }
            return value;
        }

        function parseStepBodyStrict(response, sourceStepId) {
            var rawBody = response ? response.getBody() : "";
            if (rawBody === null || rawBody === undefined || rawBody === "") {
                return {};
            }
            if (typeof rawBody === "object") {
                throw new Error("Expected string body from " + sourceStepId + " but received object");
            }
            return JSON.parse(rawBody);
        }

        function parseIsoMillis(value, inclusiveSecondEnd) {
            var text = String(value);
            var ms = Date.parse(text);
            if (isNaN(ms)) return NaN;

            // GitHub step timestamps are often second-precision (no fractional part).
            // For completed_at, treat second-precision values as inclusive to end-of-second.
            if (inclusiveSecondEnd && !/\.\d+/.test(text)) {
                ms += 999;
            }
            return ms;
        }

        function sliceStepLogsByTimestamp(rawLogs, stepName, startedAt, completedAt) {
            var startMs = parseIsoMillis(startedAt, false);
            var endMs = parseIsoMillis(completedAt, true);
            if (isNaN(startMs) || isNaN(endMs) || endMs < startMs) {
                return String(rawLogs);
            }

            var lines = String(rawLogs).split(/\r?\n/);
            var include = [];
            var inWindow = false;
            var tsRegex = /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)/;

            for (var i = 0; i < lines.length; i += 1) {
                var line = lines[i];
                var match = line.match(tsRegex);
                if (match && match[1]) {
                    var lineMs = parseIsoMillis(match[1]);
                    if (!isNaN(lineMs)) {
                        if (lineMs < startMs) {
                            inWindow = false;
                        } else if (lineMs <= endMs) {
                            inWindow = true;
                        } else {
                            inWindow = false;
                            break;
                        }
                    }
                }
                if (inWindow) {
                    include.push(line);
                }
            }

            if (include.length === 0) {
                var marker = "Run " + stepName;
                var markerHits = lines.filter(function(line) {
                    return line.indexOf(marker) >= 0;
                });
                if (markerHits.length > 0) {
                    return markerHits.join("\n");
                }
                return "";
            }
            return include.join("\n");
        }

        function parseStepFailureSummary(stepLogs) {
            var rawLines = String(stepLogs).split(/\r?\n/);
            var timestampPrefixRegex = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\s*/;
            var ansiRegex = /\x1B\[[0-?]*[ -/]*[@-~]/g;
            var controlPrefixRegex = /^##\[(group|endgroup|debug|command|section|warning|notice|error)\]/;
            var syntheticRegexA = /^##\[error\]Process completed with exit code (\d+)\.$/;
            var syntheticRegexB = /^Process completed with exit code (\d+)\.$/;
            var postFailureGroupRegex = /^##\[group\]Run\s.+/;
            var discardNoiseRegexes = [
                /^##\[/,
                /^Run\s/,
                /^shell:/,
                /^env:/,
                /^\s*$/,
                /^----- .* -----$/
            ];

            function parseLineDecorations(line) {
                var tsMatch = line.match(timestampPrefixRegex);
                var timestamp = tsMatch ? tsMatch[1] : "";
                var withoutTimestamp = line.replace(timestampPrefixRegex, "");
                var cleaned = withoutTimestamp.replace(ansiRegex, "");
                return {
                    timestamp: timestamp,
                    cleaned: cleaned
                };
            }

            function isNoiseLine(line) {
                for (var i = 0; i < discardNoiseRegexes.length; i += 1) {
                    if (discardNoiseRegexes[i].test(line)) return true;
                }
                return false;
            }

            var normalized = [];
            var syntheticSummary = "";
            var exitCode = null;
            var seenSynthetic = false;

            for (var i = 0; i < rawLines.length; i += 1) {
                var parsedLine = parseLineDecorations(rawLines[i]);
                var line = parsedLine.cleaned;
                var mA = line.match(syntheticRegexA);
                var mB = line.match(syntheticRegexB);
                if (mA || mB) {
                    var code = parseInt((mA ? mA[1] : mB[1]), 10);
                    syntheticSummary = "Process completed with exit code " + String(code) + ".";
                    exitCode = isNaN(code) ? null : code;
                    seenSynthetic = true;
                    normalized.push({
                        line: syntheticSummary,
                        timestamp: parsedLine.timestamp,
                        is_control: true,
                        is_synthetic: true
                    });
                    continue;
                }

                if (seenSynthetic && postFailureGroupRegex.test(line)) {
                    break;
                }

                var isControl = controlPrefixRegex.test(line);
                normalized.push({
                    line: line,
                    timestamp: parsedLine.timestamp,
                    is_control: isControl,
                    is_synthetic: false
                });
            }

            var cleaned = [];
            for (var j = 0; j < normalized.length; j += 1) {
                var n = normalized[j];
                if (!isNoiseLine(n.line) || n.is_synthetic) {
                    cleaned.push(n);
                }
            }
            var firstTrueLogMs = NaN;
            for (var k = 0; k < cleaned.length; k += 1) {
                var candidate = cleaned[k];
                if (candidate.is_control || !candidate.line || !candidate.timestamp) continue;
                var candidateMs = Date.parse(candidate.timestamp);
                if (!isNaN(candidateMs)) {
                    firstTrueLogMs = candidateMs;
                    break;
                }
            }

            var stepLogLines = [];
            var lineCounter = 0;
            for (var x = 0; x < cleaned.length; x += 1) {
                var item = cleaned[x];
                if (!item.line || item.is_control) continue;
                lineCounter += 1;
                var lineMs = item.timestamp ? Date.parse(item.timestamp) : NaN;
                var offsetMs = 0;
                if (!isNaN(firstTrueLogMs) && !isNaN(lineMs)) {
                    offsetMs = lineMs - firstTrueLogMs;
                    if (offsetMs < 0) offsetMs = 0;
                }
                stepLogLines.push({
                    log: item.line,
                    line_number: lineCounter,
                    milliseconds_since_first_true_log: offsetMs
                });
            }

            return {
                step_log_lines: stepLogLines,
                synthetic_summary: syntheticSummary,
                exit_code: exitCode
            };
        }

        var body = JSON.parse(context.getBody());
        var repo = body.repo;
        var runId = body.run_id;
        var jobId = body.job_id;
        var stepName = body.step_name;
        var stepNumber = body.step_number;
        var stepStartedAt = body.step_started_at;
        var stepCompletedAt = body.step_completed_at;
        var logFetchDeploymentAccessId = body.log_fetch_deployment_access_id;
        var logFetchStepId = body.log_fetch_step_id;

        var logsResponse = context.sendToStep("github-action-get-job-logs", JSON.stringify({
            operation: "get-workflow-job-logs",
            repo: repo,
            job_id: jobId
        }));
        var logsBody = parseStepBodyStrict(logsResponse, "github-action-get-job-logs");
        var redirectUrl = logsBody.redirect_location;

        var fetchedLogsResponse = context.sendToStep(logFetchDeploymentAccessId, logFetchStepId, JSON.stringify({
            repo: repo,
            run_id: runId
        }));
        var fetchedLogsBody = parseStepBodyStrict(fetchedLogsResponse, logFetchStepId);
        var logsText = fetchedLogsBody.logs;
        var slicedLogs = sliceStepLogsByTimestamp(logsText, stepName, stepStartedAt, stepCompletedAt);
        var parsed = parseStepFailureSummary(slicedLogs);

        context.setBody(assertString(JSON.stringify({
            status: "ok",
            operation: "get-step-logs",
            repo: repo,
            run_id: runId,
            job_id: jobId,
            step_name: stepName,
            step_number: stepNumber,
            step_started_at: stepStartedAt,
            step_completed_at: stepCompletedAt,
            logs_redirect_url: redirectUrl,
            step_log_lines: parsed.step_log_lines,
            synthetic_summary: parsed.synthetic_summary,
            exit_code: parsed.exit_code
        })));
    });
