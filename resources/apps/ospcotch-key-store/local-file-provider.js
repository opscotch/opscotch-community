doc
  .description("Implement immutable pair storage using local files")
  .run(() => {
    if (context.getData("storageProvider") !== "local-file") {
      throw new Error("unsupported storage provider");
    }

    const input = JSON.parse(context.getBody());
    const bytes = context.bytes();
    const files = context.files("storage-root");
    const idBytes = bytes.createFromString(input.pairId);
    const idDigest = bytes.sha256(idBytes);
    const fileName = `${bytes.binaryToHex(idDigest)}.pair.json`;
    bytes.release([idBytes, idDigest]);

    const temporaryFileName = () => {
      const random = context.crypto().randomBytes(12);
      const suffix = bytes.binaryToHex(random);
      bytes.release([random]);
      return `${fileName}.${suffix}.tmp`;
    };

    const readStored = () => {
      try {
        return JSON.parse(files.read(fileName));
      } catch (error) {
        const detail = String(error);
        if (detail.indexOf("FC2") >= 0 || detail.indexOf("Not permitted") >= 0) {
          throw new Error("storage provider unavailable");
        }
        return null;
      }
    };

    const existing = readStored();
    if (input.operation === "getPair") {
      if (!existing) {
        context.setBody(JSON.stringify({ status: "not-found" }));
        return;
      }
      if (existing.publicRecordId !== input.publicRecordId
        || existing.secretRecordId !== input.secretRecordId) {
        throw new Error("storage record identity mismatch");
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
        context.setBody(JSON.stringify({
          status: "conflict",
          recordVersion: 1,
          error: "pair already exists"
        }));
        return;
      }
      const temporaryFile = temporaryFileName();
      files.write(temporaryFile, JSON.stringify({
        pairId: input.pairId,
        publicRecordId: input.publicRecordId,
        secretRecordId: input.secretRecordId,
        publicRecord: input.publicRecord,
        secretRecord: input.secretRecord
      }));
      try {
        files.move(temporaryFile, "storage-root", fileName, false, false);
      } catch (error) {
        try { files.delete(temporaryFile); } catch (cleanupError) { /* best effort */ }
        context.setBody(JSON.stringify({ status: "conflict", error: "pair already exists" }));
        return;
      }
      context.setBody(JSON.stringify({ status: "created", recordVersion: 1 }));
      return;
    }

    throw new Error(`unsupported storage operation: ${input.operation}`);
  });
