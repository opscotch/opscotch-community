/*
Expecting an input body as per below containing a key value

{
    "key": "ABC-12345"
}

*/
data = JSON.parse(context.getData());
body = context.getMessageBodyAsString();
response = JSON.parse(body);
// Replace placeholder "{key}" in the path with value from the body
context.setUrl(data["host-ref"], data["path"].replace("{key}", response.key));
