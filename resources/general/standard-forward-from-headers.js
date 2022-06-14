/**
 * Forwards to a route defined in a header or property
 * 
 * Expects:
 * - processrouteHeader or processrouteProperty data property set to name the header containting the route name
 * - headersToCopy a list of headers to copy
 */


headers = {}

if(!context.getData("headersToCopy")) {
  throw "Data property headersToCopy was expected and not found";
}

headersToCopy = JSON.parse(context.getData("headersToCopy")).forEach(header => {
  value = context.getHeader(header);
  if (value && value != "[]") {
    headers[header]= JSON.parse(context.getHeader(header))[0];
  } else {
    throw "Header " + header + " was expected and not found";
  }
});

if (!context.getData("processrouteHeader") && !context.getData("processrouteProperty")) {
  throw "Data property processrouteHeader or processrouteProperty was expected and not found" 
}

context.sendToRoute(context.getProperty(context.getData("processrouteProperty")) ?? JSON.parse(context.getHeader(context.getData("processrouteHeader")))[0], context.getMessageBodyAsString(), headers);
