FROM ghcr.io/opscotch/opscotch-agent-beta:latest-scratch-dev AS runtime

FROM scratch

WORKDIR /tmp

COPY --from=runtime /opscotch-agent /var/task/bootstrap

COPY opscotch-aws-lambda-receiver.app /var/task/opscotch-aws-lambda-receiver.app
ENV OPSCOTCH_BOOTSTRAP=

ENTRYPOINT ["/var/task/bootstrap"]
