doc
    .run(() => {
        
        console.log("sts token cache running for stsRequest");

        // this is an STS request, so use the default tokens
        const hostData = JSON.parse(context.getRestrictedDataFromHost("sts"));
        [ "accessKey", "secretKey", "amzSecurityToken" ].forEach(p => {
            if (!hostData[p]) throw `${p} expected as a data property on the ${hostId} host`;
        });

        const creds = {
            AccessKeyId : hostData.accessKey,
            SecretAccessKey : hostData.secretKey,
            SessionToken : hostData.amzSecurityToken
        }
        
        const expiryMs = /*fiveMinutesMs*/ 5 * 60 * 1000 + context.getTimestamp();

        context.setAuthenticationPropertiesOnStep("get-cached-tokens", expiryMs, "stsTokens", JSON.stringify(creds));
    })


