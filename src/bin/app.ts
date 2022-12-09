#!/usr/bin/env node

import * as cdk from "aws-cdk-lib";
import { InfraStack } from "../lib/stack-infra";
import {
  ServerIngestionStack,
  ServiceType,
  TierType,
} from "../lib/stack-main";
import { MSKStack } from "../lib/stack-msk";
import { VPCStack } from "../lib/stack-infra";
import { KinesisStack } from "../lib/stack-kinesis";
import { MskS3ConnectorStack } from "../lib/stack-msk-s3-connector";
import { CertificateArn, HostZone } from "../lib/constant";

const app = new cdk.App();

// ======================= vpc and infra =======================

// Create a VPC
new VPCStack(app, "clickstream-vpc", {});

// Create Infra: S3 bucket
new InfraStack(app, "clickstream-infra", {});


// ======================= Kinesis Stream  =======================

// Create Kinesis Stack
new KinesisStack(app, "cs-kinesis-small", {
  vpcIdParameterName: "/clickstream-vpc/vpcId",
  profile: {
    tier: TierType.SMALL,
  },
  kinesisConfig: {
    createDeliverLambdaToS3: true,
    createKinesisVpcEndpoint: true,
  },
  s3Config: {
    bucketNameParameterName: "/clickstream-infra/bucketName",
  },
  env: {
    region: process.env.CDK_DEFAULT_REGION,
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});


// =======================  Server to Kinesis Stream =======================


// Server EC2_NGINX_VECTOR to kinesis
new ServerIngestionStack(app, "cs-server-kinesis-ec2-vector", {
  vpcIdParameterName: "/clickstream-vpc/vpcId",
  profile: {
    tier: TierType.SMALL,
    deliverToKinesis: true,
    serviceType: ServiceType.ECS_EC2_NGINX_VECTOR,
  },
  kinesisConfig: {
    streamNameParameterName: "/cs-kinesis-small/streamName",
  },
  env: {
    region: process.env.CDK_DEFAULT_REGION,
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});
