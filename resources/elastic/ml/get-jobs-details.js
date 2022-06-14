/*
Expects:
    - the body to be the response from /_ml/anomaly_detectors/_all

Sends the "elastic-ml-stopped-job" metric with value total of stopped jobs
 */
body = JSON.parse(context.getMessageBodyAsString());
jobsList = body["jobs"];
failedJobs = "";
value = 0;


jobsList.forEach(obj => {
    // check if the Job have a finished_time value and does not contains a substring in the job_id from the dataProperty 'excludeJobs' . 
    // the name of the each job is added as metadata

    excluded = false;
    if (context.getData("excludeJobs")) {
        excludeJobs = context.getData("excludeJobs").split(',');
        for (i = 0; i < excludeJobs.length; i++) {
            
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

metric = { metric: "elastic-ml-stopped-job", value: value, type: "metric", '@timestamp': new Date().toISOString(), metadata: { "Jobs": failedJobs } };

// send to the next step

context.sendToStep(context.getData("processroute"), JSON.stringify(metric))
