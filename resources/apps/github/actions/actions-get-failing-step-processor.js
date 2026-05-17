doc
    .description("Normalize GitHub Actions get-failing-step response")
    .asUserErrors()
    .inSchema({
        type: "object",
        required: ["jobs"],
        properties: {
            jobs: {
                type: "array",
                minItems: 1,
                description: "List of jobs for this workflow run",
                items: {
                    type: "object",
                    required: ["id", "name", "conclusion", "steps"],
                    properties: {
                        id: { type: "integer", description: "Job ID" },
                        run_id: { type: "integer", description: "Workflow run ID" },
                        name: { type: "string", description: "Job name" },
                        status: { type: "string", description: "Job status" },
                        conclusion: { type: "string", description: "Job conclusion" },
                        started_at: { type: "string", description: "Job start timestamp" },
                        completed_at: { type: "string", description: "Job completion timestamp" },
                        steps: {
                            type: "array",
                            description: "Steps within this job",
                            items: {
                                type: "object",
                                required: ["name", "number", "conclusion"],
                                properties: {
                                    name: { type: "string", description: "Step name" },
                                    number: { type: "integer", description: "Step number" },
                                    status: { type: "string", description: "Step status" },
                                    conclusion: { type: "string", description: "Step conclusion" },
                                    started_at: { type: "string", description: "Step start timestamp" },
                                    completed_at: { type: "string", description: "Step completion timestamp" }
                                }
                            }
                        }
                    }
                }
            }
        }
    })
    .outSchema({
        type: "object",
        required: ["status", "operation", "run_id", "job_id", "job_name", "failing_step_name", "failing_step_number", "all_steps", "jobs"],
        properties: {
            status: { type: "string", description: "Response status" },
            operation: { type: "string", description: "Operation performed" },
            run_id: { type: "integer", description: "Workflow run ID from first job" },
            job_id: { type: "integer", description: "Failing job ID" },
            job_name: { type: "string", description: "Failing job name" },
            failing_step_name: { type: "string", description: "First failing step name" },
            failing_step_number: { type: "integer", description: "First failing step number" },
            failing_step_started_at: { type: "string", description: "First failing step start timestamp" },
            failing_step_completed_at: { type: "string", description: "First failing step completion timestamp" },
            all_steps: {
                type: "array",
                description: "All steps from failing job",
                items: {
                    type: "object",
                    required: ["name", "number", "status", "conclusion", "started_at", "completed_at"],
                    properties: {
                        name: { type: "string" },
                        number: { type: "integer" },
                        status: { type: "string" },
                        conclusion: { type: "string" },
                        started_at: { type: "string" },
                        completed_at: { type: "string" }
                    }
                }
            },
            jobs: {
                type: "array",
                description: "Summary of all jobs",
                items: {
                    type: "object",
                    required: ["id", "run_id", "run_url", "status", "conclusion", "name", "started_at", "completed_at"],
                    properties: {
                        id: { type: "integer" },
                        run_id: { type: "integer" },
                        run_url: { type: "string" },
                        status: { type: "string" },
                        conclusion: { type: "string" },
                        name: { type: "string" },
                        started_at: { type: "string" },
                        completed_at: { type: "string" }
                    }
                }
            }
        }
    })
    .run(() => {
        
        var input = JSON.parse(context.getBody());

        var out = {
            status: "ok",
            operation: "get-failing-step"
        };

        var jobs = input.jobs;
        var failingJob = null;
        var i;

        for (i = 0; i < jobs.length; i += 1) {
            if (jobs[i].conclusion === "failure") {
                failingJob = jobs[i];
                break;
            }
        }

        var failingStep = null;
        var allSteps = [];
        if (failingJob) {
            var jobSteps = failingJob.steps;
            for (i = 0; i < jobSteps.length; i += 1) {
                var step = jobSteps[i];
                if (String(step && step.name || "").indexOf("::group::") === 0) {
                    continue;
                }
                allSteps.push(step);
                if (!failingStep && step.conclusion === "failure") {
                    failingStep = step;
                }
            }
        }

        out.run_id = jobs[0].run_id;
        out.job_id = failingJob.id;
        out.job_name = failingJob.name;
        out.failing_step_name = failingStep.name;
        out.failing_step_number = failingStep.number;
        out.failing_step_started_at = failingStep.started_at;
        out.failing_step_completed_at = failingStep.completed_at;
        out.all_steps = allSteps;
        out.jobs = jobs.map((job) => ({
            id: job.id,
            run_id: job.run_id,
            run_url: job.run_url,
            status: job.status,
            conclusion: job.conclusion,
            name: job.name,
            started_at: job.started_at,
            completed_at: job.completed_at
        }));

        context.setBody(JSON.stringify(out));
    });
