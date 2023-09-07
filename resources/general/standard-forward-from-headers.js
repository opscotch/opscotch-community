/**
 * Forwards to a route defined in a header or property or data
 * 
 * Expects:
 * - processrouteHeader or processrouteProperty or processrouteData data property set to name the header containing the route name
 * - headersToCopy a list of headers to copy
 */


headers = {}

if (!context.getData("headersToCopy")) {
  throw "Data property headersToCopy was expected and not found";
}

headersToCopy = JSON.parse(context.getData("headersToCopy")).forEach(header => {
  value = context.getHeader(header);
  if (value && value != "[]") {
    headers[header] = JSON.parse(context.getHeader(header))[0];
  } else {
    throw "Header " + header + " was expected and not found";
  }
});

if (!context.getData("processrouteHeader") && !context.getData("processrouteProperty") && !context.getData("processrouteData")) {
  throw "Data property processrouteHeader or processrouteProperty or processrouteData was expected and not found"
}

context.sendToStep(context.getData("processrouteData") ?? (context.getProperty(context.getData("processrouteProperty")) ?? JSON.parse(context.getHeader(context.getData("processrouteHeader")))[0]), context.getMessageBodyAsString(), headers);
