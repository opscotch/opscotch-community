doc                       
    .inSchema(
        {
            type: "object",
            properties : {
                query : {
                    type : "string"
                }
            }
        }
    )
    .dataSchema(
        {
            type : "object",
            required : [ "setProperty" ],
            properties : {
                required : {
                    type : "boolean"
                },
                extract : {
                    type : "array",
                    items : {
                        type : "string"
                    }
                },
                setProperty : {
                    type: "string"
                }
            }
        }
    )
    .run(() => {

        const required = context.getData("required") == "true";
        if (required && !JSON.parse(context.getBody()).query) {
            throw "Query string required and not found";
        }
        const queryString = JSON.parse(context.getBody()).query;
        
        if (queryString) {
            const params = {};
            const pairs = (queryString[0] === '?' ? queryString.substr(1) : queryString).split('&');
            for (let i = 0; i < pairs.length; i++) {
                const pair = pairs[i].split('=');
                params[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1] || '');
            }
            var toSet = params;

            const extractString = context.getData("extract");
            if (extractString) {
                toSet = {}
                JSON.parse(extractString).forEach(param => {
                    toSet[param] = params[param];
                    if (required && !toSet[param]) {
                        throw `query param ${param} is required but not found`;
                    }
                });
            }

            console.log(JSON.stringify(toSet));
            context.setProperty(context.getData("setProperty"), JSON.stringify(toSet));
        }
        
    });