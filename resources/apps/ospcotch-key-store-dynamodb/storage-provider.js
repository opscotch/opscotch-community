doc
  .description("Route the storage contract to the DynamoDB provider")
  .run(() => {
    const response = context.sendToStep("storage-provider-dynamodb", context.getBody());
    if (response.isErrored()) {
      throw new Error("storage provider unavailable");
    }
    context.setBody(response.getBody());
  });
