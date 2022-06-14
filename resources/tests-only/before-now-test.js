// 8< 8< 8< COPY AND PASTE WITH THE BELOW COMMENT
// copy and pasted from before-now-test.js
function getDurationInMinutes() {
    let MAX_MINUTES = 1440;
    let tm = context.getTimestampManager();
    let firstTimestamp = tm.firstTimestamp();
    return (firstTimestamp && tm.minutesAgo(firstTimestamp) < MAX_MINUTES ? tm.minutesAgo(firstTimestamp) : MAX_MINUTES)
}

// Test below
/* 
This test calls getDurationInMintues twice.
The first is expected to be 1440, and the second is expected to be 0
They are sent as a metric so that the test can assert them
*/
tm = context.getTimestampManager();

context.sendMetric("FIRST", getDurationInMinutes());

tm.set("something", "" + (context.getTimestamp() - (5*60*1000))); // 5 minutes ago

context.sendMetric("SECOND", getDurationInMinutes());

tm.set("something else", "" + context.getTimestamp()); // now

context.sendMetric("THIRD", getDurationInMinutes()); // however this should send 5 minutes ago

tm.set("something", "" + (context.getTimestamp())); // set to now.

context.sendMetric("FOURTH", getDurationInMinutes());