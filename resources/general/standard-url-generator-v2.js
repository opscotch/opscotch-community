/*
Expects two data properties to have been set:
- path : the URL path
- host-ref : the id of the host definition in the bootstrap

The path allows substitutions in the form of "${property}" where property will be
replaced with the value from the key firstly in the data object and secondly in
the passed json body

*/

sub = (obj, path) => {
    entries = Object.entries(obj);
    for (let i = 0; i < entries.length; i++) {
        k = entries[i][0];
        v = entries[i][1];
        path = path.replaceAll("${" + k + "}", v)
    }
    return path;
}

data = JSON.parse(context.getData());
path = data["path"];

// sub data
path = sub(data, path);

// sub passed
try {
    path = sub(JSON.parse(context.getPassedMessageAsString()), path);
} catch {
    // only works for json!
}

// sub body
try {
    path = sub(JSON.parse(context.getMessageBodyAsString()), path);
} catch {
    // only works for json!
}

context.setUrl(data["host-ref"], path);

if (data["method"]) {
    context.setHttpMethod(data["method"].toUpperCase());
}