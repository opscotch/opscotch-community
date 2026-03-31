doc
    .description("Owns the framework's runtime-only in-memory MCP registry using stepProperties")
    .inSchema({
        type: "object",
        required: ["action"],
        properties: {
            action: {
                type: "string"
            },
            payload: { type: "object" },
            name: { type: "string" },
            uri: { type: "string" }
        }
    })
    .outSchema({
        type: "object",
        required: ["ok"],
        properties: {
            ok: { type: "boolean" },
            result: { type: "object" },
            error: { type: "object" }
        }
    })
    .run(() => {
        var REGISTRY_KEY = "mcpRegistryJson";

        function resultOk(result) {
            context.setBody(JSON.stringify({
                ok: true,
                result: result
            }));
        }

        function resultError(code, message, data) {
            var error = {
                code: code,
                message: message
            };

            if (data !== undefined) {
                error.data = data;
            }

            context.setBody(JSON.stringify({
                ok: false,
                error: error
            }));
        }

        function cloneJson(value) {
            return JSON.parse(JSON.stringify(value));
        }

        function defaultRegistry() {
            return {
                namespaces: {},
                tools: {},
                resources: {},
                prompts: {}
            };
        }

        function loadRegistry() {
            var stepProperties = context.getStepProperties();
            var raw = stepProperties.get(REGISTRY_KEY);

            if (raw == null || raw === "") {
                return defaultRegistry();
            }

            return JSON.parse("" + raw);
        }

        function saveRegistry(registry) {
            context.getStepProperties().put(REGISTRY_KEY, JSON.stringify(registry));
        }

        function requireNonEmptyString(value, fieldName) {
            if (typeof value !== "string" || value.trim() === "") {
                throw new Error(fieldName + " must be a non-empty string");
            }

            return value.trim();
        }

        function requireObject(value, fieldName) {
            if (value == null || typeof value !== "object" || Array.isArray(value)) {
                throw new Error(fieldName + " must be an object");
            }

            return value;
        }

        function requireArray(value, fieldName) {
            if (!Array.isArray(value)) {
                throw new Error(fieldName + " must be an array");
            }

            return value;
        }

        function ensureNoHandlerOnStatic(source, fieldName) {
            if (source.handler != null) {
                throw new Error(fieldName + " static source must not declare handler");
            }
        }

        function normalizeHandler(handler, fieldName) {
            handler = requireObject(handler, fieldName);

            return {
                deploymentAccessId: requireNonEmptyString(handler.deploymentAccessId, fieldName + ".deploymentAccessId"),
                stepId: requireNonEmptyString(handler.stepId, fieldName + ".stepId")
            };
        }

        function normalizeTool(namespace, tool) {
            tool = requireObject(tool, "tool");

            var localName = requireNonEmptyString(tool.name, "tool.name");
            var fqName = namespace + "." + localName;
            var handler = normalizeHandler(tool.handler, "tool.handler");
            var inputSchema = tool.inputSchema == null ? { type: "object", properties: {} } : requireObject(tool.inputSchema, "tool.inputSchema");

            return {
                kind: "tool",
                namespace: namespace,
                localName: localName,
                name: fqName,
                title: tool.title == null ? localName : "" + tool.title,
                description: tool.description == null ? "" : "" + tool.description,
                inputSchema: cloneJson(inputSchema),
                handler: handler
            };
        }

        function normalizeResource(namespace, resource) {
            resource = requireObject(resource, "resource");

            var uri = requireNonEmptyString(resource.uri, "resource.uri");
            var source = requireObject(resource.source, "resource.source");
            var sourceType = requireNonEmptyString(source.type, "resource.source.type");

            if (sourceType !== "static" && sourceType !== "dynamic") {
                throw new Error("resource.source.type must be static or dynamic");
            }

            var normalizedSource;

            if (sourceType === "static") {
                ensureNoHandlerOnStatic(source, "resource.source");

                if (source.text == null && source.contents == null) {
                    throw new Error("resource.source static content requires text or contents");
                }

                normalizedSource = {
                    type: "static"
                };

                if (source.text != null) {
                    normalizedSource.text = "" + source.text;
                }

                if (source.contents != null) {
                    normalizedSource.contents = cloneJson(source.contents);
                }
            } else {
                normalizedSource = {
                    type: "dynamic",
                    handler: normalizeHandler(source.handler, "resource.source.handler")
                };
            }

            return {
                kind: "resource",
                namespace: namespace,
                uri: uri,
                name: resource.name == null ? uri : "" + resource.name,
                description: resource.description == null ? "" : "" + resource.description,
                mimeType: resource.mimeType == null ? "text/plain" : "" + resource.mimeType,
                source: normalizedSource
            };
        }

        function normalizePrompt(namespace, prompt) {
            prompt = requireObject(prompt, "prompt");

            var localName = requireNonEmptyString(prompt.name, "prompt.name");
            var fqName = namespace + "." + localName;
            var source = requireObject(prompt.source, "prompt.source");
            var sourceType = requireNonEmptyString(source.type, "prompt.source.type");
            var normalizedSource;

            if (sourceType !== "static" && sourceType !== "dynamic") {
                throw new Error("prompt.source.type must be static or dynamic");
            }

            if (sourceType === "static") {
                ensureNoHandlerOnStatic(source, "prompt.source");

                if (source.text == null && source.messages == null) {
                    throw new Error("prompt.source static content requires text or messages");
                }

                normalizedSource = {
                    type: "static"
                };

                if (source.text != null) {
                    normalizedSource.text = "" + source.text;
                }

                if (source.messages != null) {
                    normalizedSource.messages = cloneJson(source.messages);
                }
            } else {
                normalizedSource = {
                    type: "dynamic",
                    handler: normalizeHandler(source.handler, "prompt.source.handler")
                };
            }

            return {
                kind: "prompt",
                namespace: namespace,
                localName: localName,
                name: fqName,
                title: prompt.title == null ? localName : "" + prompt.title,
                description: prompt.description == null ? "" : "" + prompt.description,
                arguments: prompt.arguments == null ? [] : cloneJson(requireArray(prompt.arguments, "prompt.arguments")),
                source: normalizedSource
            };
        }

        function normalizeRegistration(payload) {
            payload = requireObject(payload, "registration");

            var namespace = requireNonEmptyString(payload.namespace, "registration.namespace");
            var tools = payload.tools == null ? [] : requireArray(payload.tools, "registration.tools");
            var resources = payload.resources == null ? [] : requireArray(payload.resources, "registration.resources");
            var prompts = payload.prompts == null ? [] : requireArray(payload.prompts, "registration.prompts");

            if (tools.length === 0 && resources.length === 0 && prompts.length === 0) {
                throw new Error("registration must include at least one tool, resource, or prompt");
            }

            var namespaceRecord = {
                namespace: namespace,
                tools: {},
                resources: {},
                prompts: {}
            };

            var i;
            var normalized;

            for (i = 0; i < tools.length; i += 1) {
                normalized = normalizeTool(namespace, tools[i]);

                if (namespaceRecord.tools[normalized.name] != null) {
                    throw new Error("duplicate tool in namespace: " + normalized.name);
                }

                namespaceRecord.tools[normalized.name] = normalized;
            }

            for (i = 0; i < resources.length; i += 1) {
                normalized = normalizeResource(namespace, resources[i]);

                if (namespaceRecord.resources[normalized.uri] != null) {
                    throw new Error("duplicate resource in namespace: " + normalized.uri);
                }

                namespaceRecord.resources[normalized.uri] = normalized;
            }

            for (i = 0; i < prompts.length; i += 1) {
                normalized = normalizePrompt(namespace, prompts[i]);

                if (namespaceRecord.prompts[normalized.name] != null) {
                    throw new Error("duplicate prompt in namespace: " + normalized.name);
                }

                namespaceRecord.prompts[normalized.name] = normalized;
            }

            return {
                namespace: namespace,
                replace: payload.replace === true,
                namespaceRecord: namespaceRecord
            };
        }

        function removeNamespace(registry, namespace) {
            var existing = registry.namespaces[namespace];
            var key;

            if (existing == null) {
                return;
            }

            for (key in existing.tools) {
                delete registry.tools[key];
            }

            for (key in existing.resources) {
                delete registry.resources[key];
            }

            for (key in existing.prompts) {
                delete registry.prompts[key];
            }

            delete registry.namespaces[namespace];
        }

        function registerPayload(payload) {
            var normalized = normalizeRegistration(payload);
            var registry = loadRegistry();
            var namespace = normalized.namespace;
            var namespaceRecord = normalized.namespaceRecord;
            var key;
            var replaced = registry.namespaces[namespace] != null;

            if (replaced && normalized.replace !== true) {
                throw new Error("namespace already registered: " + namespace);
            }

            if (replaced) {
                removeNamespace(registry, namespace);
            }

            for (key in namespaceRecord.tools) {
                if (registry.tools[key] != null) {
                    throw new Error("tool already registered: " + key);
                }
            }

            for (key in namespaceRecord.resources) {
                if (registry.resources[key] != null) {
                    throw new Error("resource already registered: " + key);
                }
            }

            for (key in namespaceRecord.prompts) {
                if (registry.prompts[key] != null) {
                    throw new Error("prompt already registered: " + key);
                }
            }

            registry.namespaces[namespace] = namespaceRecord;

            for (key in namespaceRecord.tools) {
                registry.tools[key] = namespaceRecord.tools[key];
            }

            for (key in namespaceRecord.resources) {
                registry.resources[key] = namespaceRecord.resources[key];
            }

            for (key in namespaceRecord.prompts) {
                registry.prompts[key] = namespaceRecord.prompts[key];
            }

            saveRegistry(registry);

            return {
                namespace: namespace,
                replaced: replaced,
                registeredCounts: {
                    tools: Object.keys(namespaceRecord.tools).length,
                    resources: Object.keys(namespaceRecord.resources).length,
                    prompts: Object.keys(namespaceRecord.prompts).length
                }
            };
        }

        function listValues(map) {
            return Object.keys(map).sort().map(function(key) {
                return map[key];
            });
        }

        function run() {
            try {
                var request = JSON.parse(context.getPassedMessageAsString());
                var registry;
                var result;

                if (request == null || typeof request !== "object" || Array.isArray(request)) {
                    throw new Error("registry request must be an object");
                }

                switch (request.action) {
                case "register":
                    resultOk(registerPayload(request.payload));
                    return;
                case "list-tools":
                    registry = loadRegistry();
                    resultOk({ tools: listValues(registry.tools) });
                    return;
                case "get-tool":
                    registry = loadRegistry();
                    result = registry.tools[requireNonEmptyString(request.name, "request.name")];

                    if (result == null) {
                        resultError(-32602, "Unknown tool", { name: request.name });
                        return;
                    }

                    resultOk({ tool: result });
                    return;
                case "list-resources":
                    registry = loadRegistry();
                    resultOk({ resources: listValues(registry.resources) });
                    return;
                case "get-resource":
                    registry = loadRegistry();
                    result = registry.resources[requireNonEmptyString(request.uri, "request.uri")];

                    if (result == null) {
                        resultError(-32602, "Unknown resource", { uri: request.uri });
                        return;
                    }

                    resultOk({ resource: result });
                    return;
                case "list-prompts":
                    registry = loadRegistry();
                    resultOk({ prompts: listValues(registry.prompts) });
                    return;
                case "get-prompt":
                    registry = loadRegistry();
                    result = registry.prompts[requireNonEmptyString(request.name, "request.name")];

                    if (result == null) {
                        resultError(-32602, "Unknown prompt", { name: request.name });
                        return;
                    }

                    resultOk({ prompt: result });
                    return;
                default:
                    resultError(-32601, "Unknown registry action", { action: request.action });
                    return;
                }
            } catch (e) {
                resultError(-32602, e.message);
            }
        }

        run();
    });
