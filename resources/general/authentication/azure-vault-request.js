doc
    .description("Sets the Authorization header from a passed Azure vault token response.")
    .run(() => {
        const body = context.getPassedMessageAsString();
        console.log("XXXXXX" + body);
        const json = JSON.parse(body);

        const tokenType = json["token_type"];
        const accessToken = json["access_token"];

        context.setHeader("Authorization", tokenType + " " + accessToken);
    });
