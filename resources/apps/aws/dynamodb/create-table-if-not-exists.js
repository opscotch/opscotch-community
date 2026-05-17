doc
    .dataSchema(
        {
            required : [ "tableName" ],
            properties : {
                awsServicesId : { type : "string" },
                tableName : { type : "string" },
                tableSchema : { type : "object" },
                enableTTL : { type : "boolean" }
            }
        }
    )
    .run(() => {

        const awsServices = context.getData("awsServicesId") ?? "aws-services";
        const tableName = context.getData("tableName");

        const statusKey = `${tableName}-status`;
        const createStartedKey = `${tableName}-create-started`;

        const stepProps = context.getStepProperties();

        let status = stepProps.get(statusKey);

        // If already marked ready, no-op and allow downstream processors to continue.
        if (status === "ready") {
            context.setProperty("status", status);
            return;
        }

        const describeTable = () => {
            return context.sendToStep(
                awsServices,
                "dynamodb-request",
                JSON.stringify({
                    operationName : "DescribeTable",
                    body : { TableName : tableName }
                })
            );
        };

        const parseDdbError = (response, label) => {
            const statusCode = (response.getProperty("status_code") + "");
            const rawBody = response.getBody() ?? "";

            let parsed = null;
            if (rawBody) {
                parsed = safeJsonParse(rawBody, `${label}-error-body`);
            }

            const errorTypeRaw = parsed?.__type ?? parsed?.code ?? "";
            const errorType = String(errorTypeRaw).split("#").pop();
            const message = parsed?.message ?? parsed?.Message ?? "";

            return {
                statusCode,
                errorType,
                message,
                rawBody
            };
        };

        const safeJsonParse = (raw, label) => {
            try {
                return JSON.parse(raw);
            } catch (e) {
                context.diagnosticLog(`Failed to parse JSON for ${label}`);
                return null;
            }
        };

        let createdThisRun = false;
        let tableStatus = null;

        const createStarted = stepProps.get(createStartedKey) === "true";

        //
        // 1️⃣ First invocation path — determine state
        //
        if (!createStarted) {

            const ddbResponse = describeTable();

            const describeStatus = (ddbResponse.getProperty("status_code") + "");

            // Only ResourceNotFound should trigger CreateTable.
            if (describeStatus === "400") {

                const describeError = parseDdbError(ddbResponse, "DescribeTable");

                if (describeError.errorType !== "ResourceNotFoundException") {
                    context.diagnosticLog(
                        `DescribeTable failed (${describeError.statusCode}) ${describeError.errorType}: ${describeError.message}`
                    );
                    if (describeError.rawBody) {
                        context.diagnosticLog(`DescribeTable error body: ${describeError.rawBody}`);
                    }
                    return;
                }

                context.diagnosticLog(`Table not found. Creating: ${tableName}`);

                stepProps.put(createStartedKey, "true");

                var tableSchema = context.getData("tableSchema");
                if (!tableSchema) {
                    context.diagnosticLog("tableSchema is not defined in data");
                    return;
                }

                tableSchema = safeJsonParse(tableSchema, "tableSchema");
                if (!tableSchema) return;
                tableSchema.TableName = tableName;

                const createResponse = context.sendToStep(
                    awsServices,
                    "dynamodb-request",
                    JSON.stringify({
                        operationName : "CreateTable",
                        body : tableSchema
                    })
                );

                if ((createResponse.getProperty("status_code") + "") !== "200") {
                    const createError = parseDdbError(createResponse, "CreateTable");
                    context.diagnosticLog(
                        `CreateTable failed (${createError.statusCode}) ${createError.errorType}: ${createError.message}`
                    );
                    if (createError.rawBody) {
                        context.diagnosticLog(`CreateTable error body: ${createError.rawBody}`);
                    }
                    return;
                }

                createdThisRun = true;
                status = "creating";
                stepProps.put(statusKey, status);

            } else {

                // Table exists — check status
                const response = safeJsonParse(ddbResponse.getBody(), "DescribeTable");
                if (!response) return;
                const tableInfo = response.Table ?? response.TableDescription;
                if (!tableInfo || !tableInfo.TableStatus) {
                    context.diagnosticLog("DescribeTable response missing TableStatus");
                    return;
                }
                tableStatus = tableInfo.TableStatus;

                if (tableStatus === "ACTIVE") {
                    status = "ready";
                    stepProps.put(statusKey, status);
                    context.setProperty("status", status);
                    return;
                }

                // If exists and CREATING → fall through to busy wait
                stepProps.put(createStartedKey, "true");
                status = "creating";
                stepProps.put(statusKey, status);
            }
        }

        //
        // 2️⃣ Busy wait barrier until ACTIVE
        //
        const MAX_ATTEMPTS = 60;
        const SLEEP_MS = 1000;

        let attempts = 0;

        while (attempts < MAX_ATTEMPTS) {

            const ddbResponse = describeTable();

            if ((ddbResponse.getProperty("status_code") + "") !== "200") {
                context.sleep(SLEEP_MS);
                attempts++;
                continue;
            }

            const response = safeJsonParse(ddbResponse.getBody(), "DescribeTable");
            if (!response) {
                context.sleep(SLEEP_MS);
                attempts++;
                continue;
            }
            const tableInfo = response.Table ?? response.TableDescription;
            if (!tableInfo || !tableInfo.TableStatus) {
                context.sleep(SLEEP_MS);
                attempts++;
                continue;
            }
            tableStatus = tableInfo.TableStatus;

            if (tableStatus === "ACTIVE") {
                break;
            }

            context.sleep(SLEEP_MS);
            attempts++;
        }

        if (tableStatus !== "ACTIVE") {
            context.diagnosticLog(`Timeout waiting for table ${tableName} to become ACTIVE`);
            return;
        }

        //
        // 3️⃣ Apply TTL only if we created table in THIS execution
        //
        if (createdThisRun) {

            let ttl = context.getData("enableTTL");

            if (ttl) {
                ttl = safeJsonParse(ttl, "enableTTL");
                if (ttl === null) {
                    context.diagnosticLog("Skipping TTL due to invalid enableTTL data");
                    ttl = false;
                }

                if (ttl) {

                    context.diagnosticLog(`Enabling TTL on ${tableName}`);

                    const ttlResponse = context.sendToStep(
                        awsServices,
                        "dynamodb-request",
                        JSON.stringify({
                            operationName : "UpdateTimeToLive",
                            body : {
                                TableName : tableName,
                                TimeToLiveSpecification : {
                                    Enabled : true,
                                    AttributeName : "ttlEpochSeconds"
                                }
                            }
                        })
                    );

                    if ((ttlResponse.getProperty("status_code") + "") !== "200") {
                        context.diagnosticLog("TTL request returned " + ttlResponse.getProperty("status_code"));
                    }
                }
            }
        }

        //
        // 4️⃣ Mark ready
        //
        status = "ready";
        stepProps.put(statusKey, status);

        context.setProperty("status", status);
    });
