FROM ghcr.io/opscotch/opscotch-agent:3.0.1.19-dev

# Create working directory
WORKDIR /opscotch

# Copy user configuration files into the working directory
COPY workflow.json /opscotch/workflow.json
COPY bootstrap.json /opscotch/bootstrap.json

# Override the entrypoint so we can invoke the agent with a file argument
ENTRYPOINT ["/bin/busybox", "sh", "-c", "/opscotch-agent /opscotch/bootstrap.json"]
