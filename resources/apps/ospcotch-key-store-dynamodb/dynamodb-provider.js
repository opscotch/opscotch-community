doc
  .description("Store immutable public and secret records with DynamoDB")
  .dataSchema({
    required: ["tableName", "awsServicesId", "keyField"],
    properties: {
      tableName: { type: "string" },
      awsServicesId: { type: "string" },
      keyField: { type: "string" }
    }
  })
  .run(() => {
    const input = JSON.parse(context.getBody());
    const tableName = context.getData("tableName");
    const awsServicesId = context.getData("awsServicesId");
    const keyField = context.getData("keyField");

    const table = context.sendToStep("table-check", null);
    if (table.isErrored() || table.getProperty("status") !== "ready") {
      throw new Error("storage provider unavailable");
    }

    const callDynamo = (operationName, body) => {
      const response = context.sendToStep(
        awsServicesId,
        "dynamodb-request",
        JSON.stringify({ operationName, body })
      );
      if (response.isErrored()) throw new Error("storage provider unavailable");
      return response;
    };

    const statusCode = (response) => String(response.getProperty("status_code") || "200");
    const parseBody = (response) => {
      try { return JSON.parse(response.getBody() || "{}"); } catch (error) {
        throw new Error("storage provider unavailable");
      }
    };
    const errorType = (response) => {
      const body = parseBody(response);
      return String(body.__type || body.code || "").split("#").pop();
    };
    const getItem = (recordId) => {
      const response = callDynamo("GetItem", {
        TableName: tableName,
        Key: { [keyField]: { S: recordId } },
        ConsistentRead: true
      });
      if (statusCode(response) !== "200") throw new Error("storage provider unavailable");
      const item = parseBody(response).Item;
      if (!item) return null;
      try {
        return {
          recordId: item[keyField].S,
          pairId: item.pairId.S,
          recordType: item.recordType.S,
          record: JSON.parse(item.record.S)
        };
      } catch (error) {
        throw new Error("storage provider unavailable");
      }
    };

    if (input.operation === "getPair") {
      const publicItem = getItem(input.publicRecordId);
      if (!publicItem) {
        context.setBody(JSON.stringify({ status: "not-found" }));
        return;
      }
      const secretItem = input.includeSecret ? getItem(input.secretRecordId) : null;
      context.setBody(JSON.stringify({
        status: "ok",
        recordVersion: 1,
        publicRecord: publicItem.record,
        ...(input.includeSecret && secretItem ? { secretRecord: secretItem.record } : {})
      }));
      return;
    }

    if (input.operation !== "putPairIfAbsent") {
      throw new Error(`unsupported storage operation: ${input.operation}`);
    }

    const item = (recordId, recordType, record) => ({
      [keyField]: { S: recordId },
      pairId: { S: input.pairId },
      recordType: { S: recordType },
      record: { S: JSON.stringify(record) }
    });
    const response = callDynamo("TransactWriteItems", {
      TransactItems: [
        {
          Put: {
            TableName: tableName,
            Item: item(input.publicRecordId, "public", input.publicRecord),
            ConditionExpression: `attribute_not_exists(${keyField})`
          }
        },
        {
          Put: {
            TableName: tableName,
            Item: item(input.secretRecordId, "secret", input.secretRecord),
            ConditionExpression: `attribute_not_exists(${keyField})`
          }
        }
      ]
    });
    if (statusCode(response) === "200") {
      context.setBody(JSON.stringify({ status: "created", recordVersion: 1 }));
      return;
    }
    if (errorType(response) === "TransactionCanceledException"
      || errorType(response) === "ConditionalCheckFailedException") {
      context.setBody(JSON.stringify({ status: "conflict", error: "pair already exists" }));
      return;
    }
    throw new Error("storage provider unavailable");
  });
