/* It take the list of contracts and call the urlgenerator for each one */

body = context.getMessageBodyAsString();
response = JSON.parse(body);
contracts = response["response"];

contracts.forEach(function (item) {
    /* the id and title contract are saved them as a property variable
     to use them later to generate the metric name */
    context.setProperty(item["id"], item["title"]);
    context.addSplitReturnItem(JSON.stringify(item))

})
