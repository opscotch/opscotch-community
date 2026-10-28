doc
    .description("Collects named Set-Cookie values into Cookie auth properties on a target step.")
    .dataSchema({
        type: "object",
        required: ["cookies", "authPropertiesStep", "cookiesPropertyName"],
        properties: {
            cookies: {
                type: "array",
                items: { type: "string" }
            },
            authPropertiesStep: { type: "string" },
            cookiesPropertyName: { type: "string" }
        }
    })
    .run(() => {
        const regexs = [];
        JSON.parse(context.getData("cookies")).forEach(cookieName => regexs.push("(" + cookieName + ")=([^;]+)"));

        const authenticationProperties = { "Cookie": "" };

        JSON.parse(context.getHeader("Set-Cookie")).forEach(cookie => {
            regexs.forEach(regex => {

                const matches = context.regexMatch(regex, cookie);

                if (matches) {
                    authenticationProperties.Cookie = authenticationProperties.Cookie + matches[0] + "; ";
                }
            })

        });

        const authPropertiesRoute = context.getData("authPropertiesStep");
        context.setAuthenticationPropertiesOnStep(authPropertiesRoute, 3600000, context.getData("cookiesPropertyName"), JSON.stringify(authenticationProperties));
    });
