doc
.description("Takes the body as an object. On the property named by the data 'property' it replaces the string as defined, and returns the object to the body")
.fromInput(doc.BODY)
.fromSchema(
    {
        type : "object"
    }
).dataSchema(
    {
        type : "object",
        required : ["property", "replace", "with"],
        properties : {
            property : {
                type : "string",
                description : "Property to change"
            },
            replace : {
                type: "string",
                description : "search for this"
            },
            with : {
                type: "string",
                description : "replace with this"
            }
        }
        
    }
).run(() => {
    var obj = JSON.parse(context.getBody());
    var property = context.getData("property");
    var replace = context.getData("replace");
    var _with = context.getData("with");

    obj[property] = obj[property].replace(replace, _with);
    
    context.setBody(JSON.stringify(obj));
})