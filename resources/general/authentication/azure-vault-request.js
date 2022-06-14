/*
Extracts the access token from the passed authentication response
and sets it as a header.


Passed authentication response:
{
    "token_type":"Bearer",
    "expires_in":"3599",
    "ext_expires_in":"3599",
    "expires_on":"1603334417",
    "not_before":"1603330517",
    "resource":"https://vault.azure.net",
    "access_token":"eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsIng1dCI6ImtnMkxZczJUMENUaklmajRydDZKSXluZW4zOCIsImtpZCI6ImtnMkxZczJUMENUaklmajRydDZKSXluZW4zOCJ9.eyJhdWQiOiJodHRwczovL3ZhdWx0LmF6dXJlLm5ldCIsImlzcyI6Imh0dHBzOi8vc3RzLndpbmRvd3MubmV0LzRiMjI5MGZlLThjMTMtNGY1Ny1iYWE2LTI2YjlhYjc2ZjQwZi8iLCJpYXQiOjE2MDMzMzA1MTcsIm5iZiI6MTYwMzMzMDUxNywiZXhwIjoxNjAzMzM0NDE3LCJhaW8iOiJFMlJnWUhEU05kM3ZlckZoU3FEaHB4dW5zNlVUQVE9PSIsImFwcGlkIjoiOWUxN2ZhZjQtZjVlZi00NWE4LWJlNmYtNjQxODUwZWFhZjMxIiwiYXBwaWRhY3IiOiIxIiwiaWRwIjoiaHR0cHM6Ly9zdHMud2luZG93cy5uZXQvNGIyMjkwZmUtOGMxMy00ZjU3LWJhYTYtMjZiOWFiNzZmNDBmLyIsIm9pZCI6IjU0YzZkMjI1LTRkZmYtNDUxZi1iNjFhLTEyMDhmMDNiMzYwYiIsInJoIjoiMC5BQUFBX3BBaVN4T01WMC02cGlhNXEzYjBEX1Q2RjU3djlhaEZ2bTlrR0ZEcXJ6RW1BQUEuIiwic3ViIjoiNTRjNmQyMjUtNGRmZi00NTFmLWI2MWEtMTIwOGYwM2IzNjBiIiwidGlkIjoiNGIyMjkwZmUtOGMxMy00ZjU3LWJhYTYtMjZiOWFiNzZmNDBmIiwidXRpIjoiRW12aUhXQW1pa2FvUW41a1NnWktBQSIsInZlciI6IjEuMCJ9.QemgVS8IQk3PYApIOqM-V3p_hoR3sxoS4NP44bT69i5Vs-z0f3dAUNaiIOgxVR_gPKZKfQ-TG4BeJyK00esFY4qlLcsr8pipTzYkuN8ynchU6UP4Nr-ER65b4qDDYVqa_q-PpnHOqin8byOMnFBhjsu8TDs7RJrs9BAwwMolPuCxa88lwoGDhxmJ9vvxaZ2wsTOTm6AOU4X3wbUhdZYWR1ngtDw8KR2lCp7AAMfN6FbNtPglJlV1QeIxvRkdlexLC5gsjn64s-WixNUVGuB_dFF1cINcxYeuCRu5bp-5kGXA3IRDGGWKtzWoQM_jp2M1loZxh9DrPeiJ9OaUIC2iBg"
 }
*/

body = context.getOrigBody();
console.log("XXXXXX"+body);
json = JSON.parse(body);

tokenType = json["token_type"];
accessToken = json["access_token"];

context.setHeader("Authorization", tokenType + " " + accessToken);

