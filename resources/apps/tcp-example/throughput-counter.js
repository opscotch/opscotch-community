var c = context;
if (c.getStream() != null && c.getStream().available() > 0) {

    let bytes = c.bytes();
    let metrics = bytes.split(c.getStream().readAll(), bytes.createFromString("\n"), 0);

    let opscotch_ingest_ts = parseInt(c.getProperty("ts"));
    let opscotch_js_ingest_ts = c.getTimestamp();
    let opscotch_ingest_to_js_ts = opscotch_js_ingest_ts -  opscotch_ingest_ts;

    let data = {
        opscotch_ingest_ts : `${opscotch_ingest_ts}`,
        opscotch_js_ingest_ts : `${opscotch_js_ingest_ts}`,
        opscotch_ingest_to_js_ts : `${opscotch_ingest_to_js_ts}`
    }

    let equals = bytes.createFromString("=");
    metrics.forEach(metric => {
        let bits = bytes.split(metric, equals, 0);
        context.sendMetric("my-otel", bytes.asString(bits[0]), parseFloat(bytes.asString(bits[1])), data);
    });

    c.counter("time", c.getTimestamp() - opscotch_ingest_ts);
    const total = c.counter("count", metrics.length);

    if (total > 100000) {
        c.setCounter("time", 0);
        c.setCounter("count", 0);
    }
} else {
    // timer
    console.log(c.counter("time", 0) / c.counter("count", 0));
}
