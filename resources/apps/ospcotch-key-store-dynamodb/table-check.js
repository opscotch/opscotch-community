doc
  .description("Create the configured DynamoDB table when missing and wait for ACTIVE")
  .dataSchema({
    required: ["tableName", "awsServicesId"],
    properties: {
      tableName: { type: "string" },
      awsServicesId: { type: "string" },
      tableSchema: { type: "object" },
      enableTTL: { type: "boolean" }
    }
  })
  .run(() => {
    const tableName = context.getData("tableName");
    const awsServicesId = context.getData("awsServicesId");
    const statusKey = `${tableName}-status`;
    const createStartedKey = `${tableName}-create-started`;
    const stepProperties = context.getStepProperties();
    const getStepProperty = (key) => typeof stepProperties.get === "function"
      ? stepProperties.get(key)
      : stepProperties[key];
    const putStepProperty = (key, value) => {
      if (typeof stepProperties.put === "function") {
        stepProperties.put(key, value);
      } else {
        stepProperties[key] = value;
      }
    };

    if (getStepProperty(statusKey) === "ready") {
      context.setProperty("status", "ready");
      return;
    }

    const callDynamo = (operationName, body) => {
      const response = context.sendToStep(
        awsServicesId,
        "dynamodb-request",
        JSON.stringify({ operationName, body })
      );
      if (response.isErrored()) {
        throw new Error("storage provider unavailable");
      }
      return response;
    };

    const parseBody = (response) => {
      try {
        return JSON.parse(response.getBody() || "{}");
      } catch (error) {
        return null;
      }
    };

    const parseErrorType = (response) => {
      const body = parseBody(response) || {};
      return String(body.__type || body.code || "").split("#").pop();
    };

    const describeTable = () => callDynamo("DescribeTable", { TableName: tableName });
    let tableStatus = null;
    let createdThisRun = false;

    if (getStepProperty(createStartedKey) !== "true") {
      const described = describeTable();
      const statusCode = String(described.getProperty("status_code") || "");

      if (statusCode === "200") {
        const body = parseBody(described);
        const table = body && (body.Table || body.TableDescription);
        tableStatus = table && table.TableStatus;
      } else if (parseErrorType(described) === "ResourceNotFoundException") {
        let tableSchema = context.getData("tableSchema");
        if (!tableSchema) {
          throw new Error("storage provider unavailable");
        }
        try {
          tableSchema = typeof tableSchema === "string" ? JSON.parse(tableSchema) : tableSchema;
        } catch (error) {
          throw new Error("storage provider unavailable");
        }

        tableSchema.TableName = tableName;
        putStepProperty(createStartedKey, "true");
        const created = callDynamo("CreateTable", tableSchema);
        if (String(created.getProperty("status_code") || "") !== "200") {
          throw new Error("storage provider unavailable");
        }
        createdThisRun = true;
        tableStatus = "CREATING";
        putStepProperty(statusKey, tableStatus);
      } else {
        throw new Error("storage provider unavailable");
      }
    }

    let attempts = 0;
    while (tableStatus !== "ACTIVE" && attempts < 60) {
      const described = describeTable();
      if (String(described.getProperty("status_code") || "") === "200") {
        const body = parseBody(described);
        const table = body && (body.Table || body.TableDescription);
        tableStatus = table && table.TableStatus;
      }
      if (tableStatus === "ACTIVE") break;
      context.sleep(1000);
      attempts += 1;
    }

    if (tableStatus !== "ACTIVE") {
      throw new Error("storage provider unavailable");
    }

    if (createdThisRun && context.getData("enableTTL") === true) {
      const ttl = callDynamo("UpdateTimeToLive", {
        TableName: tableName,
        TimeToLiveSpecification: {
          Enabled: true,
          AttributeName: "ttlEpochSeconds"
        }
      });
      if (String(ttl.getProperty("status_code") || "") !== "200") {
        throw new Error("storage provider unavailable");
      }
    }

    putStepProperty(statusKey, "ready");
    context.setProperty("status", "ready");
  });
