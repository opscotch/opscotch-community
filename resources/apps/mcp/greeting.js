const inSchema = { type : "object", required : [ "name" ], properties : { name : { type : "string", description : "The name of the person to greet"} } };
const outSchema = { type : "object", properties : { greeting : { type : "string" } } };

doc
.inSchema({
    oneOf: [
      {
        type: "null",
        description: "start up"
      },
      inSchema
    ]
})
.outSchema({
    oneOf: [
      {
        type: "null",
        description: "start up"
      },
      outSchema
    ]
})
.run(() => {
    if (!context.getBody()) {
        // startup - register to mcp step.
        context.sendToStepAndForget("mcp.controller", JSON.stringify({ 
            command : "register", 
            register: { 
                tool: { 
                    stepId: "greeting", 
                    name: "opscotch_greeting", 
                    description : "A test command that gets a greeting", 
                    inputSchema: inSchema, 
                    outputSchema : outSchema
                }
            }
        }));
    } else {
        const json = JSON.parse(context.getBody());
        const name = json.name;
        context.setBody(JSON.stringify({ greeting: `Why! Hello there ${name}` }));
    }
});
