doc                       
    .inSchema(
        {
            type: "object",
            required : ["query"],
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

        const queryString = JSON.parse(context.getBody()).query;
        
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
            });
        }

        context.setProperty(context.getData("setProperty"), JSON.stringify(toSet));
    });