/**
 * Verify body is in JSON format by trying to parse it
 * 
 * If not valid, then send an empty object, onus is on results processor to check the object contains required fields.
 * Otherwise rely on default passing of body
 */

body = context.getMessageBodyAsString();

try {
    JSON.parse(body);
}
catch (error) {
    context.setMessage("{}");
    context.diagnosticLog ("Failed to parse Body as JSON: " + error.toString());
}