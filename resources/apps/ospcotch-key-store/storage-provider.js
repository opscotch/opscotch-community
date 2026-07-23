doc
  .description("Route the storage contract to the configured provider")
  .run(() => {
    const provider = context.getData("storageProvider");
    const providerSteps = {
      "local-file": "storage-provider-local-file",
      memory: "storage-provider-memory"
    };
    const providerStep = providerSteps[provider];
    if (!providerStep) {
      throw new Error("unsupported storage provider");
    }
    const response = context.sendToStep(providerStep, context.getBody());
    if (response.isErrored()) {
      throw new Error("storage provider unavailable");
    }
    context.setBody(response.getBody());
  });
