passedAuthData = JSON.parse(context.getProperty("OPSCOTCH_AUTH_DATA"));

context.setUrl(passedAuthData["azureVaultHost"], "");