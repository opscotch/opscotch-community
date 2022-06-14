/* It get the list of active periods for a contract */
body = context.getMessageBodyAsString();

response = JSON.parse(body);
data = JSON.parse(context.getData());
context.setUrl(data["host-ref"], '/contracts/' + response.id + '/periods?_filters=standing(opened)&_fields=contract_id');
