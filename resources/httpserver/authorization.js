doc
    .description("Optional basic or token authorization handling. To activate, define the authorizationHeaders object in data.")
    .dataSchema({
        type : "object",
        properties : {
            authorizationHeaders : {
                type : "object",
                properties : {
                    basic : {
                        type : "object",
                        properties : {
                            values : {
                                type : "array",
                                items : {
                                    type : "string"
                                }
                            }
                        }
                    },
                    token : {
                        type : "object",
                        properties : {
                            values : {
                                type : "array",
                                items : {
                                    type : "string"
                                }
                            }
                        }
                    }
                }
            }
        }
    })
    .run(() => {

        if (context.getData("authorizationHeaders")) {
            let authorizationHeaders = JSON.parse(context.getData("authorizationHeaders"));

            let validAuthValues = [];
            let addSchemeValues = (schemeName, values, allowBareValue) => {
                if ( ! Array.isArray(values) ) {
                    return;
                }
                values.forEach(value => {
                    if (typeof value !== "string") {
                        return;
                    }
                    let trimmedValue = value.trim();
                    if ( ! trimmedValue ) {
                        return;
                    }
                    validAuthValues.push(`${schemeName} ${trimmedValue}`);
                    if (allowBareValue) {
                        validAuthValues.push(trimmedValue);
                    }
                });
            };

            if (authorizationHeaders.basic) {
                addSchemeValues("basic", authorizationHeaders.basic.values, false);
            }
            if (authorizationHeaders.token) {
                addSchemeValues("token", authorizationHeaders.token.values, true);
            }

            if (validAuthValues.length === 0) {
                return;
            }

            let authorizationHeaderValues = JSON.parse(context.getHeader("Authorization") || "[]");
            let hasAuth = authorizationHeaderValues.find(s => {
                if (typeof s !== "string") {
                    return false;
                }
                let headerValue = s.trim();
                if ( ! headerValue ) {
                    return false;
                }
                let lowerHeaderValue = headerValue.toLowerCase();
                if (lowerHeaderValue.startsWith("basic")) {
                    let remainder = headerValue.slice(5).trim();
                    let normalizedValue = remainder ? `basic ${remainder}` : "basic";
                    return validAuthValues.find(v => v == normalizedValue);
                }
                if (lowerHeaderValue.startsWith("token")) {
                    let remainder = headerValue.slice(5).trim();
                    let normalizedValue = remainder ? `token ${remainder}` : "token";
                    return validAuthValues.find(v => v == normalizedValue);
                }
                return validAuthValues.find(v => v == headerValue);
            });

            if ( ! hasAuth ) {
                context.setProperty("status_code", 401);
                context.setBody("");
                context.setStream(null);
                context.end();
            }
        }
        
    });
