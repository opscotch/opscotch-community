# opscotch
Opscotch is in closed beta, and will be available for the general public in due time


# opscotch Agent

This repository contains opscotch resources and tests.

Developing configurations and tests is done against a real opscotch agent using the opscotch testing harness.

## Tests and Resources

The `test` directory contains all the sample configurations and the associated test files. The tests can be considered examples of how to author configs. 
The configs should be pretty close to copy and paste to add them to a client config.

The `resource` directory contains the reusable libraries of javascript code for doing common tasks.

### Naming convention

Files in the testing directory should follow this basic naming convention:
- `<testname>.config.json` is the example configuration file. This configuration will be loaded into the agent when the test is executed
- `<testname>.test.json` is the test definition. 

Other files you will likely add to this folder are the mock http response files that you want the testing harness to mock out.

# Resources

When you are writing configuration files, you will likely need some javascript. You can either write the javascript directly into the configuration file as json-escaped javascript, 
or you can write normal javascript in a file and have the test package them into the configuration for you. These files are referred to as "resources".

# Executing tests

Using the supplied binaries, you can run your tests against a real running Agent. You will need the test harness jar file and a JVM to run it. 

Create a `bin` folder in the root of the folder (ie along side the `resources` and `tests` folders, and download and unzip the binaries to there (there is a .gitignore on `bin`).

To run the agent and tests, you will need two terminal shells. Execute the following from the opscotch root directory, where `tests` is the tests directory and `resources` is the resources directory:
```
java -jar bin/opscotch-testrunner.jar tests resources
```

If you want to run a single test, add it to the end:
```
java -jar bin/opscotch-testrunner.jar test resources path/to/the/test.config
```

The test will ask you to start the agent in another terminal with a specific argument, do that like so:
```
opscotch-agent /argument/provided/by/test
```

The test logs will show in the test terminal, the agent logs will show in the agent terminal.

# Environment variables

`OPSCOTCH_TRUSTSTORE` - Path to custom trust store

`OPSCOTCH_TRUSTSTORE_PASSWORD` - Custom trust store password

# Creating a Truststore

When connecting to service that uses a self signed certificate, the certificate needs to be added to a Truststore and added set into the agent.

How to create a truststore:
- from your java installation, find the `<java-home>/lib/security/cacerts` file
- test it by listing the trusted certificates `keytool -list -keystore <path-to-truststore> -storepass changeit`
- take a copy of this file
- add the CA certificate (pem) to the truststore `keytool -import -alias <name> -keystore cacerts -file <file> -storepass changeit`

Note: If you can't talk via curl, then you can't talk via opscotch.

# Anomaly Detection settings (where supported - check with your opscotch partner)

When you know the expected behaviour of a metric, you can give a clue as to what should trigger an anomaly:

- Any deviation in the mean value (of the bucket) is anomolous : `ad_m`
- When the mean value (of the bucket) is anomolous: `ad_mh`
- When the mean value (of the bucket) is anomolous: `ad_ml`
- When the min value (of the bucket) is anomolous: `ad_mn`
- When the max value (of the bucket) is anomolous: `ad_mx`
- When the distinct count (of the bucket) is anomolous: `ad_dc`
- When the a value (of the bucket) is not zero: `ad_nonz`
- When the value (of the bucket) is zero: `ad_z`
- When there is a high variance of value (of the bucket) is anomolous: `ad_vh`
- When there is a low variance of value (of the bucket) is anomolous: `ad_vl`
- When the mean variance of value (of the bucket) is anomolous: `ad_v`
 
Before using any of these check that the anomaly detections are in place.

These map to the Elastic Machine Learning detections https://www.elastic.co/guide/en/machine-learning/master/ml-functions.html

How to use:

There are two properties that need to be set for a metric: `ad` and `ad_p`

The `ad` metric is one of above ie. `ad_m`

The `ad_p` metric is the period to run data collection for anomaly detection. The only detection that is running is 'minutely', so it should always be set to `1m` (1 minute). If you have a need for something else, you'll need to setup the anomaly detection job.

How to configure:

If you know the metric name then you can declare the anomaly properties in the `data` object and they will automatically be applied when the metric is applied. ie
```
"data" : {
    "ad" : {
        "elastic-index-stats-is-throttled" : [ "MEAN_HIGH" ],
        "elastic-index-stats-query-count" : [ "MEAN_HIGH" ],
        "elastic-index-stats-fetch-count" : [ "MEAN_HIGH" ],
        "elastic-index-stats-merge-count" : [ "MEAN_HIGH" ],
        "elastic-index-stats-index-failed" : [ "NON_ZERO" ]
    },
    "metadata" : {
        "ad_p" : "1m"
    }
}

where: 
        MEAN         : "ad_m"
        MEAN_HIGH    : "ad_mh"
        MEAN_LOW     : "ad_ml"
        MIN          : "ad_mn"
        MAX          : "ad_mx"
        DISTINCT     : "ad_dc"
        NON_ZERO     : "ad_nonz"
        ZERO         : "ad_z"
        VARIANCE_HIGH: "ad_vh" 
        VARIANCE_LOW : "ad_low"
        VARIANCE     : "ad_v"
```

If your names are not static you will need to use a specialised call to `context.sendMetric(long timestamp, String key, double value, Map<String, String> metadata)`

Your javascript might look like this:
```
context.sendMetric(context.getTimestamp(), "my-metric", 1234, { "ad" : "MEAN_HIGH", "ad_p" : "1m"});
```
