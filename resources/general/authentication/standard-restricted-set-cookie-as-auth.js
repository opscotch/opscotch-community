/**
 * Expects cookie names in data
 * "data" : {
 *      "cookies" : ["COOKIE1", "COOKIE2"],
 *      "authPropertiesStep" : "stepToSetCookiesOn",
 *      "cookiesPropertyName" : "cookies"
 * }
 */

regexs = [];
JSON.parse(context.getData("cookies")).forEach( cookieName => regexs.push("(" + cookieName + ")=([^;]+)"));

authenticationProperties = { "Cookie" : "" };

JSON.parse(context.getHeader("Set-Cookie")).forEach(cookie => {
    regexs.forEach(regex => {
        
        matches = context.regexMatch(regex, cookie);
        
        if(matches) {
            authenticationProperties.Cookie = authenticationProperties.Cookie + matches[0] + "; ";
        }
    })
    
});

authPropertiesRoute = context.getData("authPropertiesStep");
context.setAuthenticationPropertiesOnStep(authPropertiesRoute, 3600000, context.getData("cookiesPropertyName"), JSON.stringify(authenticationProperties));