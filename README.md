# opscotch community resources

This repository contains the public resources that are useful when working with [opscotch workflows](https://docs.opscotch.co/docs/current/workflow).

To use opscotch you need a (trial) license. [Please request one here](https://www.opscotch.co/license).

Please see the [opscotch documentation website](https://docs.opscotch.co/docs/current/introduction/audience) for how to use these resources.


In this directory is an example `testrunner.config.json` file that you can use to run these tests. 

To run the opscotch tests **you will need to download the opscotch agent and test runner** from [here](https://github.com/opscotch/release/releases).

## Recommended running environment

The following outlines the recommended running environment for the test runner. This is recommended so that when seeking support this is the common setup that everyone uses.

1. Clone the opscotch community repository (this repository) to a directory. This directory will now be known as `OPSCOTCH_COMMUNITY_ROOT`.
1. In the community root directory, add your `license.txt`
1. Ensure your `testrunner.config.json` looks something like this
    ```json
    { 	
        "license" : "license.txt",	
        "resourceDirs" : [ "resources" ],	
        "testDirs" : [ "tests" ]
    }
    ```
1. It is important to understand that the directories mentioned in the `testrunner.config.json`: `resourceDirs` and `testDirs` are __relative to the `opscotch-testrunner` executable WORKING DIRECTORY__ ie. the directory where you START the agent: 
    - _**NOT**_ the directory the `opscotch-testrunner` file is in
    - _**NOT**_ the direcory the `testrunner.config.json` is in
    - _**NOT**_ the `OPSCOTCH_COMMUNITY_ROOT`
    - _**However**_, that all being said, in this example we will be starting the `opscotch-testrunner` from the `OPSCOTCH_COMMUNITY_ROOT`, so that will be our working direcory, AND both `resources` and `tests` exist and are relative to `OPSCOTCH_COMMUNITY_ROOT`.

1. Set an environment variable `OPSCOTCH_COMMUNITY_ROOT` to the path to your community root directory.
1. From a terminal, ensure that `OPSCOTCH_COMMUNITY_ROOT` is your working directory. Start the `opscotch-testrunner` with `testrunner.config.json` as the first argument.
1. The `opscotch-testrunner` will start and will provide the arguments to start the agent with.
1. In another terminal start the `opscotch-agent`:
    1. Make sure to set the environment variable `OPSCOTCH_COMMUNITY_ROOT` for the agent also.
    1. Start the `opscotch-agent` with the arguments provided by the `opscotch-testrunner`.
    1. Once the `opscotch-agent` starts engaging with the `opscotch-testrunner` the `opscotch-testrunner` with start loading the tests.
