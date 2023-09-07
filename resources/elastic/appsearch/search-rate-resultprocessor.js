/*
Expects:
    - the body to be the response from an aggregate search on logs-app_search.analytics-default/_search

    {
  "aggregations": {
    "counts_by_time": {
      "buckets": [
        {
          "key" : 1648522800000,
          "counts_by_action": {
            "doc_count_error_upper_bound": 0,
            "sum_other_doc_count": 0,
            "buckets": [
              {
                "key": "loco_moco_search",
                "doc_count": 24
              },
              {
                "key": "loco_moco_click",
                "doc_count": 3
              }
            ]
          }
        },
        {
          "key" : 1648522860000,
          "counts_by_action": {
            "doc_count_error_upper_bound": 0,
            "sum_other_doc_count": 0,
            "buckets": [
              {
                "key": "loco_moco_search",
                "doc_count": 18
              },
              {
                "key": "loco_moco_click",
                "doc_count": 1
              }
            ]
          }
        }
      ]
    }
  }
}
  
*/

// maps elastic values to phm values
key_map = { "loco_moco_search" : "elastic-appsearch-search-rate", "loco_moco_click" : "elastic-appsearch-click-rate" }; 


// by the nature of the aggregation, we can get buckets outside of the queried range, we'll just filter them with the last run time
lastRun = context.getTimestampManager().get("lastRun")

JSON.parse(context.getMessageBodyAsString())["aggregations"]["counts_by_time"]["buckets"].forEach(timeBucket => {
    if (timeBucket.key > lastRun) {
        timeBucket.counts_by_action.buckets.forEach(item => {
            context.sendMetric(timeBucket.key, key_map[item.key], item.doc_count);
            context.getTimestampManager().setIfLastest("lastRun", timeBucket.key.toString());
        })
    }
});
