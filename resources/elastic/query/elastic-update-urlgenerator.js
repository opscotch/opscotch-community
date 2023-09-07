/*
Sets the url to update a document.
Expects a header/property to have been passed with the ID of the document to update

Expects the following properties:
- index: the name of the index to update
- idheader: the name of the passed header with the document ID to update
- idproperty: the name of the passed property with the document ID to update

*/
recordId = null;
if (context.getData("idproperty") && context.getProperty(context.getData("idproperty"))) {
    recordId = context.getProperty(context.getData("idproperty"))
} else {
    recordId = JSON.parse(context.getHeader(context.getData("idheader")))[0];
}

context.setUrl(context.getData("host-ref"), "/" + context.getData("index") + "/_update/" + recordId );
context.setHttpMethod("POST");
