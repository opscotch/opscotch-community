doc
  .description("Provide an in-memory-compatible immutable pair store for tests")
  .run(() => {
    if (context.getData("storageProvider") !== "memory") {
      throw new Error("unsupported storage provider");
    }

    const input = JSON.parse(context.getBody());
    const pairs = JSON.parse(context.getPersistedItem("pairs") || "{}");
    const existing = pairs[input.pairId];

    if (input.operation === "getPair") {
      if (!existing) {
        context.setBody(JSON.stringify({ status: "not-found" }));
        return;
      }
      context.setBody(JSON.stringify({
        status: "ok",
        recordVersion: 1,
        publicRecord: existing.publicRecord,
        ...(input.includeSecret ? { secretRecord: existing.secretRecord } : {})
      }));
      return;
    }

    if (input.operation === "putPairIfAbsent") {
      if (existing) {
        context.setBody(JSON.stringify({ status: "conflict", recordVersion: 1, error: "pair already exists" }));
        return;
      }
      pairs[input.pairId] = {
        publicRecordId: input.publicRecordId,
        secretRecordId: input.secretRecordId,
        publicRecord: input.publicRecord,
        secretRecord: input.secretRecord
      };
      context.setPersistedItem("pairs", JSON.stringify(pairs));
      context.setBody(JSON.stringify({ status: "created", recordVersion: 1 }));
      return;
    }

    throw new Error(`unsupported storage operation: ${input.operation}`);
  });
