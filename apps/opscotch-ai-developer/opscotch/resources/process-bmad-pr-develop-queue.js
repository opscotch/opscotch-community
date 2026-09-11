doc
  .description("Process one queued PR develop request")
  .inSchema({
    oneOf: [
      {
        type: "object",
        additionalProperties: true,
        properties: {
          repo: { type: "string", description: "Repository in owner/repo format" },
          pull_number: { type: "number", description: "PR number" }
        }
      },
      {
        type: "null",
        description: "Timer trigger sends no body"
      }
    ]
  })
  .outSchema({
    type: "object",
    properties: {
      queued: { type: "boolean", description: "Whether queued" },
      processed: { type: "boolean", description: "Whether processed" },
      queue_size: { type: "number", description: "Queue size" },
      remaining: { type: "number", description: "Items remaining" }
    }
  })
  .run(() => {

    var QUEUE_KEY = "cli-sidecar:pr:develop:queue";

    function getQueue() {
      return JSON.parse(context.getPersistedItem(QUEUE_KEY) ?? "[]");
    }

    function setQueue(queue) {
      context.setPersistedItem(QUEUE_KEY, JSON.stringify(queue));
    }

    var incoming = JSON.parse(context.getBody() || "{}");
    if (incoming && typeof incoming === "object" && incoming.repo !== undefined && incoming.pull_number !== undefined) {
      var queue = getQueue();
      queue.push(incoming);
      setQueue(queue);
      context.setBody(JSON.stringify({ queued: true, queue_size: queue.length }));
      return;
    }

    var queue2 = getQueue();
    if (!Array.isArray(queue2) || queue2.length === 0) {
      context.setBody(JSON.stringify({ processed: false, reason: "empty-queue" }));
      return;
    }

    var item = queue2.shift();
    setQueue(queue2);
    // Dequeue is committed before dispatch. A failed sendToStepAndForget drops the item
    // (no requeue) so a busy/missing worker cannot wedge the queue forever.
    try {
      context.sendToStepAndForget("dispatch-bmad-pr-develop-worker", JSON.stringify(item));
    } catch (e) {
      console.log(
        "pr-develop-queue worker-dispatch-failed: " +
          JSON.stringify({
            repo: item && item.repo ? item.repo : "",
            pull_number: item && item.pull_number != null ? item.pull_number : null,
            error: String(e && e.message ? e.message : e),
            remaining: queue2.length
          })
      );
      context.setBody(JSON.stringify({
        processed: true,
        dropped: true,
        remaining: queue2.length,
        reason: "worker-dispatch-failed"
      }));
      return;
    }
    context.setBody(JSON.stringify({ processed: true, remaining: queue2.length }));
  });
