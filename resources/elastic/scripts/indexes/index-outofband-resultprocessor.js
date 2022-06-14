body = context.getMessageBodyAsString();
indexList = JSON.parse(body);
persistence = context.getTimestampManager();
temp = JSON.parse(context.getData());
prefix = temp["prefix"];
indexes = [];

today = new Date();
if ((today.getMonth() + 1) < 10) {
  month = '0' + (today.getMonth() + 1)
} else {
  month = today.getMonth() + 1
}
if (today.getDate() < 10) {
  day = '0' + today.getDate()
} else {
  day = today.getDay()
}
currentDate = today.getFullYear() + '.' + month + '.' + day;

/* Getting the index name and docs number */
const REX = /[\-]\d{4}[\.](0?[1-9]|1[012])[\.](0?[1-9]|[12][0-9]|3[01])$/; /* i.e match with : index_name-2021.11.17 */
indexList.forEach(obj => {
  ind = obj["index"];
  /* considering only the indexes which name end in a date -YYYY.MM.DD and ignoring indexes which start with a . */
  if (ind.match(REX) && ind.charAt(0) != ".") {
    /* remove the date to the index name and save it on indexes*/
    indexNoDate = ind.slice(0, ind.length - 11);
    indexes.push([obj["index"], indexNoDate, { count: obj["docs.count"], ingestSize: obj["pri.store.size"], storeSize: obj["store.size"] }])

  }
});

/* sorting the indexes */
indexes.sort();
indexes.reverse();

/* processing the data, because we've sorted, we don't take the first index of the named group 
   this means that we only work on the others index for each group */
result = {};
currentIndex = "";
INDEX_NAME = 1;
OBJECT = 2;


function processMetricType(persistencePrefix, metricPrefix, indexName, metricCurrentValue) {

  persistencename = persistencePrefix + indexName;

  previousMetric = persistence.get(persistencename);
  currentMetric = parseFloat(metricCurrentValue);

  /* shortindexName is the name of the index without the date */
  shortindexName = indexName.slice(0, indexName.length - 11);

  metricname = metricPrefix + shortindexName;
  /*the full index name is sending as metadata*/

  // we only want one metric per index (not per day)
  // if there is a metric in results already, use that, otherwise create a new one
  
  metric = result[metricname] ?? { metric: metricname, value: 0, type: "metric", '@timestamp': new Date().toISOString(), metadata: { "IndexName": "" } }

  if (previousMetric && currentMetric > previousMetric) {
    // there is new data in an old index
    metric.value = metric.value + currentMetric - previousMetric;

    if (metric.metadata.IndexName.length > 0) {
      metric.metadata.IndexName = metric.metadata.IndexName + ","
    }
    metric.metadata.IndexName = metric.metadata.IndexName + indexName
  }

  result[metricname] = metric;
  persistence.set(persistencename, metricCurrentValue);
}

/* if the current name is different to the previous or is equl to "" (means is the first one on the list and probably the currently used index) we don't take it */
indexes.forEach(obj => {
  if ((obj[INDEX_NAME] != currentIndex) || (currentIndex == "")) {
    currentIndex = obj[INDEX_NAME];
  }
  else {
    currentIndex = obj[INDEX_NAME];
    /* we send the index full name obj[0] to create the metric and the current doc count */ 
    processMetricType("OutOfBand-", prefix, obj[0], obj[OBJECT].count)
  }
});

/* sending the metrics */
Object.keys(result).forEach(item => context.sendToStep(context.getData("processroute"), JSON.stringify(result[item])));
