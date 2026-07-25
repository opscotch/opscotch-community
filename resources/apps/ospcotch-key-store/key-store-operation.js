doc
  .description("Execute immutable public/private key-pair operations")
  .inSchema({
    oneOf: [
      {
        type: "object",
        required: ["operation", "keyId", "purpose"],
        additionalProperties: false,
        properties: {
          operation: { const: "get" },
          keyId: { type: "string", minLength: 1, maxLength: 256 },
          purpose: {
            type: "string",
            enum: ["sign", "authenticated", "symmetric", "anonymous"]
          }
        }
      },
      {
        type: "object",
        required: ["operation", "keyId", "purpose"],
        additionalProperties: false,
        properties: {
          operation: { const: "getOrGenerate" },
          keyId: { type: "string", minLength: 1, maxLength: 256 },
          purpose: {
            type: "string",
            enum: ["sign", "authenticated", "symmetric", "anonymous"]
          }
        }
      },
      {
        type: "object",
        required: ["operation", "keyId", "purpose", "keyPair"],
        additionalProperties: false,
        properties: {
          operation: { const: "load" },
          keyId: { type: "string", minLength: 1, maxLength: 256 },
          purpose: {
            type: "string",
            enum: ["sign", "authenticated", "symmetric", "anonymous"]
          },
          keyPair: {
            type: "object",
            required: ["publicKeyHex", "secretKeyHex"],
            additionalProperties: false,
            properties: {
              publicKeyHex: { type: ["string", "null"], minLength: 1 },
              secretKeyHex: { type: "string", minLength: 1 }
            }
          }
        }
      }
    ]
  })
  .dataSchema({
    required: [
      "publicKeyStoreSeedHex",
      "publicKeyStoreDomain",
      "secretKeyStoreDomain",
      "derivationVersion",
      "storageDeploymentAccessId",
      "storageStepId"
    ],
    properties: {
      publicKeyStoreSeedHex: { type: "string", pattern: "^[0-9a-fA-F]{64}$" },
      secretKeyStoreSeedHex: {
        type: "string",
        pattern: "^(|[0-9a-fA-F]{64})$"
      },
      publicKeyStoreDomain: { type: "string", minLength: 1 },
      secretKeyStoreDomain: { type: "string", minLength: 1 },
      derivationVersion: { type: "string", minLength: 1 },
      storageDeploymentAccessId: { type: "string", minLength: 1 },
      storageStepId: { type: "string", minLength: 1 },
      storageTestStepId: { type: "string", minLength: 1 }
    }
  })
  .run(() => {
    const input = JSON.parse(context.getBody());
    const operation = input.operation;
    const bytes = context.bytes();
    const crypto = context.crypto();
    const publicSeedHex = context.getData("publicKeyStoreSeedHex");
    const configuredSecretSeedHex = context.getData("secretKeyStoreSeedHex");
    const secretSeedHex = typeof configuredSecretSeedHex === "string"
      && configuredSecretSeedHex.trim().length > 0
      ? configuredSecretSeedHex
      : undefined;
    const publicDomain = context.getData("publicKeyStoreDomain");
    const secretDomain = context.getData("secretKeyStoreDomain");
    const derivationVersion = context.getData("derivationVersion");
    const storageAccessId = context.getData("storageDeploymentAccessId");
    const storageStepId = context.getData("storageStepId");
    const storageTestStepId = context.getData("storageTestStepId");

    const emitMetric = (name) => {
      try {
        context.sendMetric(name, 1);
        context.diagnosticLog(name);
      } catch (error) {
        // Observability must not change the operation outcome.
      }
    };

    const release = (buffers) => {
      const live = buffers.filter((buffer) => buffer !== undefined && buffer !== null);
      if (live.length > 0) bytes.release(live);
    };

    const failIfErrored = (response) => {
      if (response.isErrored()) throw new Error(response.getAllErrors()[0]);
      return response;
    };

    const sendStorage = (body) => failIfErrored(storageTestStepId
      ? context.sendToStep(storageTestStepId, JSON.stringify(body))
      : context.sendToStep(storageAccessId, storageStepId, JSON.stringify(body)));

    const canonicalKeyId = (value) => String(value);
    const metadata = (recordType, keyId, purpose, pairId, payload) => JSON.stringify({
      format: "opscotch-key-store/key-record/v2",
      recordType,
      keyId,
      purpose,
      pairId,
      derivation: derivationVersion,
      domain: recordType === "public" ? publicDomain : secretDomain,
      payload
    });

    const digestHex = (value) => {
      const encoded = bytes.createFromString(value);
      const digest = bytes.sha256(encoded);
      const result = bytes.binaryToHex(digest);
      release([encoded, digest]);
      return result;
    };

    const pairIds = (keyId, purpose) => {
      const identity = `${keyId}\u0000${purpose}`;
      return {
        pairId: digestHex(`opscotch-key-store/pair/v2\u0000${identity}`),
        publicRecordId: digestHex(`opscotch-key-store/public/v2\u0000${identity}`),
        secretRecordId: digestHex(`opscotch-key-store/secret/v2\u0000${identity}`)
      };
    };

    const getPair = (ids, includeSecret) => {
      const response = JSON.parse(sendStorage({
        operation: "getPair",
        pairId: ids.pairId,
        publicRecordId: ids.publicRecordId,
        secretRecordId: ids.secretRecordId,
        includeSecret
      }).getBody());
      if (response.status !== "ok" && response.status !== "not-found") {
        throw new Error(response.error || "storage unavailable");
      }
      return response;
    };

    const tagFor = (seedHex, recordType, keyId, purpose, pairId, payload) => {
      const seed = bytes.hexToBinary(seedHex);
      const authInput = bytes.createFromString(metadata(recordType, keyId, purpose, pairId, payload));
      const tag = bytes.binaryToBase64(crypto.hmacSha256(seed, authInput));
      release([seed, authInput]);
      return tag;
    };

    const publicRecord = (keyId, purpose, pairId, publicKeyHex) => {
      const payload = { publicKeyHex };
      return {
        format: "opscotch-key-store/key-record/v2",
        recordType: "public",
        keyId,
        purpose,
        pairId,
        derivation: derivationVersion,
        domain: publicDomain,
        payload,
        tag: tagFor(publicSeedHex, "public", keyId, purpose, pairId, payload),
        version: 1
      };
    };

    const derive = (seed, keyId, purpose, keyPurpose) => {
      const inputBytes = bytes.createFromString([
        "opscotch-key-store",
        derivationVersion,
        keyPurpose,
        purpose,
        keyId
      ].join("\u0000"));
      const derived = crypto.hmacSha256(seed, inputBytes);
      release([inputBytes]);
      return derived;
    };

    const secretRecord = (keyId, purpose, pairId, secretKeyHex) => {
      const seed = bytes.hexToBinary(secretSeedHex);
      const encryptionKey = derive(seed, keyId, purpose, "secret-encryption");
      const macKey = derive(seed, keyId, purpose, "secret-authentication");
      const nonce = crypto.randomBytes(24);
      const plaintext = bytes.createFromString(secretKeyHex);
      const registeredKey = crypto.registerKey("symmetric", "secret", encryptionKey);
      const ciphertext = crypto.encryptSymmetric(plaintext, nonce, registeredKey);
      const nonceBase64 = bytes.binaryToBase64(nonce);
      const ciphertextBase64 = bytes.binaryToBase64(ciphertext);
      const payload = { nonce: nonceBase64, ciphertext: ciphertextBase64 };
      const authInput = bytes.createFromString(metadata("secret", keyId, purpose, pairId, payload));
      const tag = bytes.binaryToBase64(crypto.hmacSha256(macKey, authInput));
      release([seed, macKey, nonce, plaintext, ciphertext, authInput]);
      return {
        format: "opscotch-key-store/key-record/v2",
        recordType: "secret",
        keyId,
        purpose,
        pairId,
        derivation: derivationVersion,
        domain: secretDomain,
        payload,
        tag,
        version: 1
      };
    };

    const verifyPublic = (record, keyId, purpose, pairId) => {
      if (!record || record.format !== "opscotch-key-store/key-record/v2"
        || record.recordType !== "public" || record.keyId !== keyId
        || record.purpose !== purpose || record.pairId !== pairId
        || record.derivation !== derivationVersion || record.domain !== publicDomain
        || !record.payload || (record.payload.publicKeyHex !== null
          && typeof record.payload.publicKeyHex !== "string")
        || typeof record.tag !== "string" || record.version !== 1) {
        throw new Error("key record integrity failure");
      }
      if (tagFor(publicSeedHex, "public", keyId, purpose, pairId, record.payload) !== record.tag) {
        throw new Error("key record integrity failure");
      }
      return record.payload.publicKeyHex;
    };

    const decryptSecret = (record, keyId, purpose, pairId) => {
      if (!secretSeedHex || !record || record.format !== "opscotch-key-store/key-record/v2"
        || record.recordType !== "secret" || record.keyId !== keyId
        || record.purpose !== purpose || record.pairId !== pairId
        || record.derivation !== derivationVersion || record.domain !== secretDomain
        || !record.payload || typeof record.payload.nonce !== "string"
        || typeof record.payload.ciphertext !== "string" || typeof record.tag !== "string"
        || record.version !== 1) {
        throw new Error("key record integrity failure");
      }
      const seed = bytes.hexToBinary(secretSeedHex);
      const macKey = derive(seed, keyId, purpose, "secret-authentication");
      const authInput = bytes.createFromString(metadata("secret", keyId, purpose, pairId, record.payload));
      const expectedTag = bytes.binaryToBase64(crypto.hmacSha256(macKey, authInput));
      if (expectedTag !== record.tag) {
        release([seed, macKey, authInput]);
        throw new Error("key record integrity failure");
      }
      const encryptionKey = derive(seed, keyId, purpose, "secret-encryption");
      const nonce = bytes.base64ToBinary(record.payload.nonce);
      const ciphertext = bytes.base64ToBinary(record.payload.ciphertext);
      const registeredKey = crypto.registerKey("symmetric", "secret", encryptionKey);
      const plaintext = crypto.decryptSymmetric(ciphertext, nonce, registeredKey);
      const secretKeyHex = bytes.toString(plaintext);
      release([seed, macKey, authInput, nonce, ciphertext, plaintext]);
      return secretKeyHex;
    };

    const returnPair = (keyId, purpose, ids, stored, created) => {
      if (!stored.publicRecord) throw new Error("incomplete key pair");
      const publicKeyHex = verifyPublic(stored.publicRecord, keyId, purpose, ids.pairId);
      const response = {
        keyId,
        purpose,
        pairId: ids.pairId,
        keyPair: { publicKeyHex },
        created,
        version: stored.recordVersion || 1
      };
      if (secretSeedHex) {
        if (!stored.secretRecord) throw new Error("incomplete key pair");
        response.keyPair.secretKeyHex = decryptSecret(
          stored.secretRecord, keyId, purpose, ids.pairId
        );
      }
      context.setBody(JSON.stringify(response));
    };

    const generateKeyPair = (purpose) => {
      const response = failIfErrored(context.sendToStep(
        "key-store-generate-key-pair", JSON.stringify({ purpose })
      ));
      let generated;
      try {
        generated = JSON.parse(response.getBody() || "{}");
      } catch (error) {
        throw new Error("key generation failed");
      }
      if (!generated.ok || generated.purpose !== purpose || generated.encoding !== "hex"
        || !generated.keyPair || typeof generated.keyPair.secretKeyHex !== "string"
        || (generated.keyPair.publicKeyHex !== null
          && typeof generated.keyPair.publicKeyHex !== "string")) {
        throw new Error("key generation failed");
      }
      return generated.keyPair;
    };

    const keyId = canonicalKeyId(input.keyId);
    const purpose = input.purpose;
    const ids = pairIds(keyId, purpose);
    const includeSecret = Boolean(secretSeedHex);
    const stored = getPair(ids, includeSecret);

    if (operation === "get") {
      if (stored.status === "not-found") {
        emitMetric("key-store.get.not-found");
        throw new Error("key not found");
      }
      emitMetric("key-store.get.success");
      returnPair(keyId, purpose, ids, stored, false);
      return;
    }

    if (operation === "getOrGenerate") {
      if (stored.status === "ok") {
        emitMetric("key-store.get-or-generate.existing");
        returnPair(keyId, purpose, ids, stored, false);
        return;
      }
      if (!secretSeedHex) throw new Error("secret seed required for generation");
      const generated = generateKeyPair(purpose);
      const created = JSON.parse(sendStorage({
        operation: "putPairIfAbsent",
        pairId: ids.pairId,
        publicRecordId: ids.publicRecordId,
        secretRecordId: ids.secretRecordId,
        publicRecord: publicRecord(keyId, purpose, ids.pairId, generated.publicKeyHex),
        secretRecord: secretRecord(keyId, purpose, ids.pairId, generated.secretKeyHex)
      }).getBody());
      if (created.status === "created") {
        emitMetric("key-store.get-or-generate.created");
        const persisted = getPair(ids, true);
        if (persisted.status !== "ok") throw new Error("incomplete key pair");
        returnPair(keyId, purpose, ids, persisted, true);
        return;
      }
      if (created.status === "conflict") {
        emitMetric("key-store.get-or-generate.conflict");
        const winner = getPair(ids, true);
        if (winner.status !== "ok") throw new Error("incomplete key pair");
        returnPair(keyId, purpose, ids, winner, false);
        return;
      }
      throw new Error(created.error || "storage unavailable");
    }

    if (operation === "load") {
      if (!secretSeedHex) throw new Error("secret seed required for loading");

      const loaded = input.keyPair;

      if (stored.status === "ok") {
        const existingPublicKeyHex = verifyPublic(
          stored.publicRecord, keyId, purpose, ids.pairId
        );
        const existingSecretKeyHex = decryptSecret(
          stored.secretRecord, keyId, purpose, ids.pairId
        );
        if (existingPublicKeyHex === loaded.publicKeyHex
          && existingSecretKeyHex === loaded.secretKeyHex) {
          emitMetric("key-store.load.existing");
          context.setBody(JSON.stringify({
            keyId,
            purpose,
            pairId: ids.pairId,
            loaded: true,
            existing: true,
            version: stored.recordVersion || 1
          }));
          return;
        }
        throw new Error("key already exists");
      }

      const created = JSON.parse(sendStorage({
        operation: "putPairIfAbsent",
        pairId: ids.pairId,
        publicRecordId: ids.publicRecordId,
        secretRecordId: ids.secretRecordId,
        publicRecord: publicRecord(keyId, purpose, ids.pairId, loaded.publicKeyHex),
        secretRecord: secretRecord(keyId, purpose, ids.pairId, loaded.secretKeyHex)
      }).getBody());

      if (created.status === "conflict") {
        throw new Error("key already exists");
      }
      if (created.status !== "created") {
        throw new Error(created.error || "storage unavailable");
      }

      const persisted = getPair(ids, true);
      if (persisted.status !== "ok") throw new Error("incomplete key pair");
      verifyPublic(persisted.publicRecord, keyId, purpose, ids.pairId);
      decryptSecret(persisted.secretRecord, keyId, purpose, ids.pairId);
      emitMetric("key-store.load.created");
      context.setBody(JSON.stringify({
        keyId,
        purpose,
        pairId: ids.pairId,
        loaded: true,
        version: persisted.recordVersion || 1
      }));
      return;
    }

    throw new Error(`unsupported operation: ${operation}`);
  });
