// expects results from /oauth2/v2.0/token refresh token call
/*
{
  "token_type": "Bearer",
  "scope": "...",
  "expires_in": 3614,
  "ext_expires_in": 3614,
  "access_token": "...",
  "refresh_token": "..."
}
*/

body = context.getMessageBodyAsString();
data = JSON.parse(body);

// always set the latest refresh token
context.setPersistedItem("refreshToken", data["refresh_token"]);

// set authorization headers
authenticationProperties = {
    "Authorization" : data["access_token"]
};

accessTokenExpiryInMillis = data["expires_in"] * 1000 - 300000 // expiry minus 5 minutes to ensure we get an updated one
context.setAuthenticationPropertiesOnStep(context.getData("propertiesStoredOnStep"), accessTokenExpiryInMillis, context.getData("propertyName"), JSON.stringify(authenticationProperties));