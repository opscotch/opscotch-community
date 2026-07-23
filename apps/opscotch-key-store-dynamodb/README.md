# opscotch-key-store-dynamodb

Deployment-only storage for `opscotch-key-store`. It stores opaque public and
secret records in DynamoDB and delegates AWS requests to the `opscotch-aws-services`
deployment through `dynamodb-request`.

It exposes no HTTP endpoint. The only application entry point is the
`key-store-storage-call` deployment-access trigger.

## Configuration

Bootstrap data configures:

- `tableName`: DynamoDB table name.
- `keyField`: partition-key attribute name, normally `recordId`.
- `awsServicesId`: AWS services deployment access ID.

The table uses a string partition key and stores public and secret records as
separate items. Each item includes its pair ID, record type, and serialized
opaque JSON record. The storage app
calls `DescribeTable` before requests, creates the table from the bootstrap
`tableSchema` when it is missing, waits for it to become `ACTIVE`, and caches
the ready state in step properties.

## Consistency and conflicts

Reads use `ConsistentRead`. `putPairIfAbsent` uses one `TransactWriteItems`
request with `attribute_not_exists(recordId)` conditions for both items.
DynamoDB transaction cancellations become storage `conflict` responses; AWS
and transport failures become `storage provider unavailable`.

The app never receives the key-store seed and never decrypts or validates the
encrypted record contents.
