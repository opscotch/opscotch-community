doc
  .inSchema({
    oneOf: [
      {
        type: "null",
      },
      {
        type: "object",
        required: ["command"],
        properties: {
          command: {
            type: "string",
            enum: ["register", "jsonrpc"],
          },
          jsonrpc: {
            type: "object",
            properties: {
              method: {
                type: "string",
                description:
                  "The name of the method to be invoked (e.g., 'tools/list', 'tools/call')",
              },
              params: {
                description: "Method-specific parameters",
                type: ["object", "array"],
                additionalProperties: true,
              },
              id: {
                description:
                  "Unique identifier for the request. Must be omitted for notifications.",
                type: ["string", "integer"],
              },
            },
            required: ["method"],
          },
          register: {
            type: "object",
            properties: {
              tool: {
                type: "object",
                required: ["stepId", "name", "description"],
                properties: {
                  stepId: {
                    type: "string",
                  },
                  name: {
                    type: "string",
                  },
                  title: {
                    type: "string",
                  },
                  description: {
                    type: "string",
                  },
                  inputSchema: {
                    type: "object",
                    additionalProperties: true,
                  },
                  outputSchema: {
                    type: "object",
                    additionalProperties: true,
                  },
                },
              },
            },
          },
        },
      },
    ],
  })
  .run(() => {
    const REGISTERED_TOOLS = "registered_tools";

    const body = context.getBody();

    if (body) {
      const json = JSON.parse(context.getBody());

      if (json.command == "register") {
        if (!json.register) {
          throw `register requires a register payload`;
        }

        context.queue().push(JSON.stringify(json.register));
      } else if (json.command == "jsonrpc") {

        const error = (code, message, id, data) => {
            var e = {
                jsonrpc: "2.0",
                error: {
                    code: code,
                    message: message
                }
            };
            if (id) {
                e.id = id
            }

            if (data) {
                e.data = data;
            }

            context.setProperty("error", JSON.stringify(e));
            context.end();
        }

        if (json.jsonrpc.method == "initialize") {
            const initializeResponse = {
                protocolVersion: "2024-11-05",
                capabilities : {
                },
                serverInfo: {
                    name: "opscotch-mcp",
                    version: context.getData("opscotch-mcp-version"),
                },
            };

            const registeredToolsKeys = JSON.parse(
                context.getPersistedItem(REGISTERED_TOOLS) ?? "{}"
            );

            if (Object.keys(registeredToolsKeys).length > 0) {
                initializeResponse.capabilities.tools = {};
            }

            context.setBody(JSON.stringify(initializeResponse));
            context.end();
        }

        if (json.jsonrpc.method == "tools/list") {
            const toolsListResponse = {
                tools : []
            };

            const registeredToolsKeys = JSON.parse(
                context.getPersistedItem(REGISTERED_TOOLS) ?? "{}"
            );

            for (key of Object.keys(registeredToolsKeys)) {
                const tool = JSON.parse(context.getPersistedItem(key));

                const t = {
                    name : tool.name
                };

                if (tool.title) {
                    t.title = tool.title;
                }

                if (tool.description) {
                    t.description = tool.description;
                }

                if (tool.inputSchema) {
                    t.inputSchema = tool.inputSchema;
                }
                if (tool.outputSchema) {
                    t.outputSchema = tool.outputSchema;
                }

                toolsListResponse.tools.push(t);
            }

            context.setBody(JSON.stringify(toolsListResponse));
            context.end();
        }

        if (json.jsonrpc.method == "tools/call") {
            const registeredToolsKeys = JSON.parse(
                context.getPersistedItem(REGISTERED_TOOLS) ?? "{}"
            );

            if (!registeredToolsKeys[json.jsonrpc.params.name]) {
                error(1, "Tool not found", json.command.jsonrpc.id, {method : json.command.jsonrpc.method, tool: json.jsonrpc.params.name});
            }

            const tool = JSON.parse(context.getPersistedItem(json.jsonrpc.params.name));

            const responseContext = context.sendToStep(tool.stepId, JSON.stringify(json.jsonrpc.params.arguments));

            context.setBody(JSON.stringify({ structuredContent : JSON.parse(responseContext.getBody())}));
            context.end();
        }
        
        // method not found
        error(-32601, "Method not found", json.command.jsonrpc.id, {method : json.command.jsonrpc.method});
        context.end();

      }
    } else {
      const registeredToolsKeys = JSON.parse(
        context.getPersistedItem(REGISTERED_TOOLS) ?? "{}"
      );
      while (true) {
        const items = context.queue().take(1);
        if (items.length === 0) {
          break;
        }

        const register = JSON.parse(items[0]);

        if (register.tool) {
          const tool = register.tool;
          context.setPersistedItem(tool.name, JSON.stringify(tool));
          registeredToolsKeys[tool.name] = {};
        }
      }

      context.setPersistedItem(
        REGISTERED_TOOLS,
        JSON.stringify(registeredToolsKeys)
      );
    }
  });
