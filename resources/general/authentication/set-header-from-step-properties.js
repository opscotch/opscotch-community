/*
This processor expects that when the step referred to by the "authStep" data property is called,
it will place an object on the step properties referred to by the "propertiesFromStep" data property, 
with the key referred to by the "propertyName" data property. The object should contain properties of headers to be set.

The above object will be got, and the keys iterated, where by the key will be the header name, and the value the header value
*/

passedData = context.getProperty("OPSCOTCH_AUTH_DATA");
propertiesFromStep = context.getData("propertiesStoredOnStep");
propertyName = context.getData("propertyName");

headersObjectAsJSONString = context.getAuthenticationPropertiesFromStep(propertiesFromStep, propertyName);

if (headersObjectAsJSONString == null) {
    authStep = context.getData("authStep");
    context.setProperty("OPSCOTCH_AUTH_DATA", context.mergeJsonStrings(passedData, context.getData("passToAuthData")));
    context.sendToStep(authStep, null);
    headersObjectAsJSONString = context.getAuthenticationPropertiesFromStep(propertiesFromStep, propertyName);
}

headersObject = JSON.parse(headersObjectAsJSONString);

Object.keys(headersObject).forEach(headerName => {
    context.setHeader(headerName, headersObject[headerName]);
});