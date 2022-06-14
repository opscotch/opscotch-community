/**
 * Saves the current body as a property.
 * Expects:
 * - propertyName: name of property to set the body as
 */
context.setProperty(context.getData("propertyName"), context.getMessageBodyAsString());
