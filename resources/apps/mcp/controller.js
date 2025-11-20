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
            required: ["tool"],
            properties: {
              host: {
                type: "object",
                required: ["hostref", "path"],
                properties: {
                  hostref: {
                    type: "string",
                  },
                  path: {
                    type: "string",
                  },
                },
              },
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
    const OPSCOTCH_MCP_SCOPE = "opscotch.mcp";

    const body = context.getBody();

    if (body) {
      const json = JSON.parse(context.getBody());

      context
        .diagnostic()
        .setAttribute(`${OPSCOTCH_MCP_SCOPE}.controller.command`, json.command);

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
              message: message,
            },
          };
          if (id) {
            e.id = id;
          }

          if (data) {
            e.data = data;
          }

          context.diagnostic().errored(message + " " + JSON.stringify(data));
          context.diagnostic().setAttribute(`${OPSCOTCH_MCP_SCOPE}.error.code`, `${code}`);

          context.setProperty("error", JSON.stringify(e));
          context.end();
        };

        if (json.jsonrpc.method == "initialize") {
          const initializeResponse = {
            protocolVersion: "2024-11-05",
            capabilities: {
              notifications: {}
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
        } else if (json.jsonrpc.method == "tools/list") {
          const toolsListResponse = {
            tools: [],
          };

          const registeredToolsKeys = JSON.parse(
            context.getPersistedItem(REGISTERED_TOOLS) ?? "{}"
          );

          for (key of Object.keys(registeredToolsKeys)) {
            console.log(context.getPersistedItem(key));
            const tool = JSON.parse(context.getPersistedItem(key)).tool;

            const t = {
              name: tool.name,
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
        } else if (json.jsonrpc.method == "tools/call") {
          const registeredToolsKeys = JSON.parse(
            context.getPersistedItem(REGISTERED_TOOLS) ?? "{}"
          );

          if (!registeredToolsKeys[json.jsonrpc.params.name]) {
            error(1, "Tool not found", json.command.jsonrpc.id, {
              method: json.command.jsonrpc.method,
              tool: json.jsonrpc.params.name,
            });
          }

          context
            .diagnostic()
            .setAttribute(
              `${OPSCOTCH_MCP_SCOPE}.tool.name`,
              json.jsonrpc.params.name
            );

          const register = JSON.parse(
            context.getPersistedItem(json.jsonrpc.params.name)
          );

          var responseContext;
          if (register.host) {
            const remoteCall = {
              host: register.host,
              params: json.jsonrpc.params,
            };

            responseContext = context.sendToStep(
              "mcp.remoteTool",
              JSON.stringify(remoteCall)
            );
          } else {
            responseContext = context.sendToStep(
              register.tool.stepId,
              JSON.stringify(json.jsonrpc.params.arguments)
            );
          }

          if (responseContext.isErrored()) {
            error(-2, "Tool execution error", json.jsonrpc.id, {
              method: json.jsonrpc.method,
              tool: json.jsonrpc.params.name,
              error: responseContext.getErrors()[0],
            });
          }

          context.setBody(
            JSON.stringify({
              structuredContent: JSON.parse(responseContext.getBody()),
            })
          );
          context.end();
        } else if (json.jsonrpc.method == "tools/call") {

        } else {
          // method not found
          error(-32601, "Method not found", json.jsonrpc.id, {
            method: json.jsonrpc.method,
          });
          context.end();
        }
      } else {
        throw `command '${json.command}' not found`;
      }
    } else {
      // timer
      const registeredToolsKeys = JSON.parse(
        context.getPersistedItem(REGISTERED_TOOLS) ?? "{}"
      );
      while (true) {
        const items = context.queue().take(1);
        if (items.length === 0) {
          break;
        }

        const register = JSON.parse(items[0]);

        if (register) {
          context.setPersistedItem(
            register.tool.name,
            JSON.stringify(register)
          );
          registeredToolsKeys[register.tool.name] = {};
        }
      }

      context.setPersistedItem(
        REGISTERED_TOOLS,
        JSON.stringify(registeredToolsKeys)
      );
    }
  });
