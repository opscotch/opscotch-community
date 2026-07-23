# Storage test harness

`storage-contract.test.json` is the first executable harness for this app. It
runs the storage contract against the test-only persisted in-memory provider
and checks pair lookup, atomic pair creation, retrieval, and conflict.

The harness deliberately uses the repository's standard Opscotch testrunner
manifest format. The command used to launch it is environment-specific and is
not encoded here.
