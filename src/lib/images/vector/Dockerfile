ARG PLATFORM_ARG
#FROM --platform=$PLATFORM_ARG timberio/vector:0.25.1-alpine
#FROM --platform=linux/arm64 timberio/vector:0.25.1-alpine
FROM --platform=linux/amd64 timberio/vector:0.25.1-alpine

RUN echo platform=$PLATFORM_ARG

ENV AWS_REGION='__NOT_SET__'
ENV AWS_S3_BUCKET='__NOT_SET__'
ENV AWS_S3_PREFIX='__NOT_SET__'
ENV AWS_MSK_BROKERS='__NOT_SET__'
ENV AWS_MSK_TOPIC='__NOT_SET__'
ENV AWS_KINESIS_STREAM_NAME='__NOT_SET__'
ENV VECTOR_REQUIRE_HEALTHY='false'
ENV STREAM_ACK_ENABLE='true'
ENV VECTOR_THREADS=1

COPY ./config/vector*.toml /etc/vector/
COPY ./config/*.pem /etc/vector/
COPY ./config/entrypoint.sh /

RUN chmod +x /entrypoint.sh

ENTRYPOINT [ "/entrypoint.sh" ]
