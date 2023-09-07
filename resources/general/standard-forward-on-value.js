/**
 * This will forward to a step based on the value of a body object property
 * 
 * Expects:
 * - useField to be the name of the field to check
 * - forwardOnValue to be a dictiony of value to route to foward to 
 * 
 * forwardOnValue has a special value "_default" which will be used if nothing matches
 * 
 * ie
 * {
 *      "data" : {
 *          "useField" : "colour",
 *          "forwardOnValue" : {
 *              "blue" : "the-story-ends",
 *              "red" : "stay-in-wonderland"
 *          }
 *      }
 * }
 */

body = context.getMessageBodyAsString();
json = JSON.parse(body);

field = context.getData("useField");

forwarders = JSON.parse(context.getData("forwardOnValue"));

forwardTo = forwarders[""+json[field]] ?? forwarders["_default"];

context.sendToStep(forwardTo, body);
