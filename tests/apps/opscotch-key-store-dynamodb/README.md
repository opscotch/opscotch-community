# DynamoDB storage tests

The unit tests stub the `opscotch-aws-services` deployment and run without AWS
credentials. Deployment-level verification must run with a real
`opscotch-aws-services` deployment, a configured DynamoDB table, and the
`aws-services` outbound deployment permission.

The test table should use `recordId` as its string partition key and should not
contain plaintext key values. Contract tests create and read immutable public
and secret record pairs and verify DynamoDB transaction conflicts.
