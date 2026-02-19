doc
    .dataSchema(
        {
            required : [ "awsRoleArn", "awsRoleSessionName" ],
            properties : {
                awsRoleArn : {
                    type : "string"
                },
                awsRoleSessionName : {
                    type : "string"
                }
            }
        }
    ).run(() => {
        if (context.getData("stsRequest")) {
            console.log("sts token cache running for stsRequest");

            // this is an STS request, so use the default tokens
            const hostData = JSON.parse(context.getRestrictedDataFromHost("sts"));
            [ "accessKey", "secretKey" ].forEach(p => {
                if (!hostData[p]) throw `${p} expected as a data property on the ${hostId} host`;
            });
            context.setProperty("awsAccessKey", hostData.accessKey);
            context.setProperty("awsSecretKey", hostData.secretKey);


        } else {
            console.log("sts token cache");
            const stsTokensJson = context.getAuthenticationPropertiesFromStep("get-cached-tokens", "stsTokens");
            
            let creds;
            if (!stsTokensJson) {
                console.log("Requesting new tokens")
                const stsResponse = context.sendToStep("sts-request", JSON.stringify(
                    {
                        action: "AssumeRole",
                        params: {
                            RoleArn : context.getData("awsRoleArn"),
                            RoleSessionName: context.getData("awsRoleSessionName") + "-"
                        }
                    }
                ))

                creds = JSON.parse(stsResponse.getBody()).AssumeRoleResponse.AssumeRoleResult.Credentials;

                const expiryMs = new Date(creds.Expiration).getTime() - /*fiveMinutesMs*/ (5 * 60 * 1000) - context.getTimestamp();

                context.setAuthenticationPropertiesOnStep("get-cached-tokens", expiryMs, "stsTokens", JSON.stringify(creds));
            }
        }
    })


