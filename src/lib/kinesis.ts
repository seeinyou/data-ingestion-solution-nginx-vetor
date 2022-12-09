import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as kinesis from "aws-cdk-lib/aws-kinesis";
import * as firehose from "@aws-cdk/aws-kinesisfirehose-alpha";
import * as destinations from "@aws-cdk/aws-kinesisfirehose-destinations-alpha";

import { Construct } from "constructs";
import { S3SinkConfig } from "./stack-main";
import { createKinesisToS3Lambda } from "./lambda";

export interface KinesisSetting {
  shardCount: number;
  dataRetentionHours: number;
  lambdaBatchSize?: number;
}
export interface KDSProps {
  kinesisSetting: KinesisSetting;
  createDeliverLambdaToS3: boolean;
  s3Config?: S3SinkConfig;
  vpc: ec2.IVpc;
}

// kinesis data stream
export function createKDStream(scope: Construct, props: KDSProps) {
  const kinesisDataStream = new kinesis.Stream(scope, "kinesis-stream", {
    shardCount: props.kinesisSetting.shardCount,
    streamMode: kinesis.StreamMode.PROVISIONED,
    retentionPeriod: cdk.Duration.hours(
      props.kinesisSetting.dataRetentionHours
    ),
  });
  return kinesisDataStream;
}

function createKDFirehose(
  scope: Construct,
  sourceStream: kinesis.Stream,
  s3Config: S3SinkConfig
) {
  const sinkBucket = s3.Bucket.fromBucketName(
    scope,
    "kinesis-firehose-sink-bucket",
    s3Config.bucketName
  );
  const dataOutputPrefix = `${s3Config.prefix}/year=!{timestamp:yyyy}/month=!{timestamp:MM}/day=!{timestamp:dd}/hour=!{timestamp:HH}/`;
  return new firehose.DeliveryStream(scope, "kinesis-firehose-to-s3", {
    sourceStream: sourceStream,
    destinations: [
      new destinations.S3Bucket(sinkBucket, {
        compression: destinations.Compression.GZIP,
        dataOutputPrefix,
        errorOutputPrefix: `${s3Config.prefix}/firehoseFailures/!{firehose:error-output-type}/!{timestamp:yyyy}/!{timestamp:mm}/!{timestamp:dd}`,
      }),
    ],
  });
}
