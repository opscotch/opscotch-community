doc
    .description("Counts finished Elasticsearch ML jobs (optionally excluding job ID patterns) and forwards an elastic-ml-stopped-job metric.")
    .dataSchema({
        type: "object",
        required: ["processroute"],
        properties: {
            processroute: { type: "string" },
            excludeJobs: { type: "string" }
        }
    })
    .inSchema({
        type: "object",
        required: ["jobs"],
        properties: {
            jobs: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        job_id: { type: "string" },
                        finished_time: {}
                    }
                }
            }
        }
    })
    .run(() => {
        const body = JSON.parse(context.getMessageBodyAsString());
        const jobsList = body["jobs"];
        let failedJobs = "";
        let value = 0;


        jobsList.forEach(obj => {
            // check if the Job have a finished_time value and does not contains a substring in the job_id from the dataProperty 'excludeJobs' .
            // the name of the each job is added as metadata

            let excluded = false;
            if (context.getData("excludeJobs")) {
                const excludeJobs = context.getData("excludeJobs").split(',');
                for (let i = 0; i < excludeJobs.length; i++) {

                    if (obj["job_id"].match(excludeJobs[i])) {
                        excluded = true;

                    }
                }
            }
            if (obj.hasOwnProperty("finished_time") && !excluded) {
                value++;
                failedJobs = failedJobs + obj["job_id"] + " ";
            }
        });

        const metric = { metric: "elastic-ml-stopped-job", value: value, type: "metric", '@timestamp': new Date().toISOString(), metadata: { "Jobs": failedJobs } };

        // send to the next step

        context.sendToStep(context.getData("processroute"), JSON.stringify(metric))
    });
