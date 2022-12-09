import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { Construct } from "constructs";

import { KinesisSinkConfig, MskSinkConfig } from "./stack-main";
import { createALBWithLambdaServer, NGINX_PORT } from "./alb";
import { createALBSecurityGroup, createLambdaServerSecurityGroup } from "./sg";
import { AppConfig } from "./config";

import { createAlbReceiverLambda } from "./lambda";
import { createRecordInRoute53 } from "./route53";

export interface LambdaSetting {
  memorySize: number;
  timeoutSec: number;
}

interface Props {
  vpc: ec2.IVpc;
  mskConfig?: MskSinkConfig;
  kinesisConfig?: KinesisSinkConfig;
  certificateArn?: string;
  hostedZoneId?: string;
  hostedZoneName?: string;
  lambdaSetting: LambdaSetting;
}
export class IngestLambdaServerConstruct extends Construct {
  public alb: elbv2.ApplicationLoadBalancer;
  public albSg: ec2.SecurityGroup;
  public lambdaSecurityGroup: ec2.SecurityGroup;
  public lambdaRole?: iam.IRole;
  public lambdaFn: lambda.Function;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id);

    const lambdaSecurityGroup = createLambdaServerSecurityGroup(
      scope,
      props.vpc
    );
    this.lambdaSecurityGroup = lambdaSecurityGroup;

    if (props.mskConfig?.mskSecurityGroup) {
      const mskSg = props.mskConfig?.mskSecurityGroup;
      mskSg.addIngressRule(lambdaSecurityGroup, ec2.Port.tcpRange(9092, 9198));
    }

    // lambda function
    const lambdaServer = createAlbReceiverLambda(scope, {
      mskBrokerString: props.mskConfig?.mskBrokers || "__NOT_SET__",
      mskTopic: props.mskConfig?.mskTopic || "__NOT_SET__",
      kinesisStreamName: props.kinesisConfig?.streamName || "__NOT_SET__",
      vpc: props.vpc,
      lambdaSecurityGroup,
      lambdaSetting: props.lambdaSetting,
    });
    this.lambdaRole = lambdaServer.role;
    this.lambdaFn = lambdaServer;

    // ALB
    const ports = {
      http: AppConfig.serverHttpEndpointPort(),
      https: 443,
    };
    const endpointPath = AppConfig.serverEndpointPath(scope);
    this.albSg = createALBSecurityGroup(this, props.vpc, ports);
    lambdaSecurityGroup.addIngressRule(this.albSg, ec2.Port.tcp(NGINX_PORT));

    this.alb = createALBWithLambdaServer(this, {
      vpc: props.vpc,
      lambdaServer,
      sg: this.albSg,
      ports,
      endpointPath,
      certificateArn: props.certificateArn,
    });

    // add route53 record
    if (props.hostedZoneId && props.hostedZoneName) {
      createRecordInRoute53(
        scope,
        this.alb.loadBalancerDnsName,
        props.hostedZoneId,
        props.hostedZoneName
      );
    }
  }
}
