/*
Expects:
    - the body to be the response from /_cat/nodes?h=name,role&format=JSON

*/

body = context.getMessageBodyAsString();
nodeList = JSON.parse(body);

/* Getting the nodes names and roles r*/
masterEligibleNodes = 0;
nodeList.forEach(obj => {
    role = obj["role"];
    /* considering only the nodes with role m  */
    if (role.includes("m")) {
        masterEligibleNodes++;
    }
});
/* The number of master eligible nodes will send to the next step*/
item = { "master-eligible-nodes": masterEligibleNodes };

context.sendToStep(context.getData("processroute"), JSON.stringify(item))