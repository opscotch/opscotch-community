# opscotch community resources v 3.0.1

__PLEASE ENSURE THAT YOU SELECT A BRANCH COMPATIBLE WITH YOUR AGENT VERSION__

This repository contains the public resources that are useful when working with [opscotch workflows](https://docs.opscotch.co/docs/current/workflow).

To use opscotch you need a (trial) license. [Please request one here](https://www.opscotch.co/license).

Please see the [opscotch documentation website](https://docs.opscotch.co/docs/current/introduction/audience) for how to use these resources.


In this directory is an example `testrunner.config.json` file that you can use to run these tests. 

To run the opscotch tests **you will need to download the opscotch agent and test runner** from [here](https://github.com/opscotch/release/releases).

To use this file as is, place the following files in this directory:
- license.txt - update this with the contents of your own license file
- opscotch-testrunner - note that the version (and .exe) has been removed to make the instructions clearer


You can then run the tests by
- starting the test runner ```opscotch-testrunner  testrunner.config.json```
- and starting the opscotch agent with the instructions printed by the test runner
