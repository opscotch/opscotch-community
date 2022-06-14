/*
Requires the data.host-ref property to be set to the appropriate host ref.
The host data must contain o365SendEmailClientId and o365SendEmailRefreshToken

The refresh token MUST be got via the following steps:
CLIENTID must be set to the application Id in Azure Directory
TENANTID must be set to the tennant Id in Azure Directory.

The following url should be called, and the credentials of the account that will do the email sending entered

https://login.microsoftonline.com/<TENANTID>/oauth2/v2.0/authorize?client_id=<CLIENTID>&response_type=code&redirect_uri=https%3A%2F%2Flogin.microsoftonline.com%2Fcommon%2Foauth2%2Fnativeclient&response_mode=query&scope=https%3A%2F%2Fgraph.microsoft.com%2Fmail.send+offline_access&state=12345

This will be forwarded to a nonexistant url, take the query string as CODE

Execute the following curl, with the CLIENTID, TENANTID, and CODE environment variables set
curl -X POST "https://login.microsoftonline.com/$TENANTID/oauth2/v2.0/token" -H "Content-Type: application/x-www-form-urlencoded" -d "client_id=$CLIENTID&scope=https%3A%2F%2Fgraph.microsoft.com%2Fmail.send+offline_access&code=$CODE&redirect_uri=https%3A%2F%2Flogin.microsoftonline.com%2Fcommon%2Foauth2%2Fnativeclient&grant_type=authorization_code" | jq 

Save the refresh_token, and set it as o365SendEmailRefreshToken
 */



restictedData = JSON.parse(context.getRestrictedDataFromHost(context.getData("host-ref")));
refreshToken = context.getPersistedItem("refreshToken");
if (refreshToken == null) {
    refreshToken = restictedData["o365SendEmailRefreshToken"];
}

clientId = restictedData["o365SendEmailClientId"];
context.setHeader("Content-Type", "application/x-www-form-urlencoded");
context.setMessage("scope=https%3A%2F%2Fgraph.microsoft.com%2Fmail.send+offline_access&grant_type=refresh_token&client_id=" + clientId + "&refresh_token=" + refreshToken);