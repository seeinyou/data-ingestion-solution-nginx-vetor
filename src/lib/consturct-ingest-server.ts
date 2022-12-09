import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  createECSClusterAndService,
  EcsEc2NginxAndVectorAsgSetting,
  EcsEc2NginxAsgSetting,
  EcsEc2ServerAsgSetting,
  EcsFargateSetting,
} from "./ecs";
import {
  ServiceType,
  KinesisSinkConfig,
  MskSinkConfig,
  S3SinkConfig,
} from "./stack-main";
import { createALB, NGINX_PORT } from "./alb";
import { createALBSecurityGroup, createECSSecurityGroup } from "./sg";
import { AppConfig } from "./config";
import { grantMskReadWrite } from "./iam";
import { createRecordInRoute53 } from "./route53";

interface Props {
  vpc: ec2.IVpc;
  ecsServiceType: ServiceType;
  ecsFargateSetting?: EcsFargateSetting;
  ecsEc2NginxAndVectorAsgSetting?: EcsEc2NginxAndVectorAsgSetting;
  ecsEc2LuaNginxAsgSetting?: EcsEc2NginxAsgSetting;
  ecsEc2NginxLogAsgSetting?: EcsEc2NginxAsgSetting;
  ecsEc2JavaServerAsgSetting?: EcsEc2ServerAsgSetting;
  s3Config?: S3SinkConfig;
  mskConfig?: MskSinkConfig;
  kinesisConfig?: KinesisSinkConfig;
  certificateArn?: string;
  hostedZoneId?: string;
  hostedZoneName?: string;
}
export class IngestServerConstruct extends Construct {
  public alb: elbv2.ApplicationLoadBalancer;
  public albSg: ec2.SecurityGroup;
  public cluster: ecs.Cluster;
  public ecsService: ecs.Ec2Service | ecs.FargateService;
  public escTaskRole: iam.IRole;
  public asgRole: iam.IRole;
  public ecsSecurityGroup: ec2.SecurityGroup;
  public autoScalingGroup?: cdk.aws_autoscaling.AutoScalingGroup;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id);

    const ecsSecurityGroup = createECSSecurityGroup(scope, props.vpc);
    this.ecsSecurityGroup = ecsSecurityGroup;

    if (props.mskConfig?.mskSecurityGroup) {
      //https://docs.aws.amazon.com/msk/latest/developerguide/port-info.html
      const mskSg = props.mskConfig?.mskSecurityGroup;
      // mskSg.addIngressRule(ecsSecurityGroup, ec2.Port.tcp(2181));
      // mskSg.addIngressRule(ecsSecurityGroup, ec2.Port.tcp(9094));
      mskSg.addIngressRule(ecsSecurityGroup, ec2.Port.tcpRange(9092, 9198));
    }

    // ECS Cluster
    const { cluster, ecsService, httpContainerName, autoScalingGroup } =
      createECSClusterAndService(this, {
        ...props,
        ecsSecurityGroup,
      });
    this.cluster = cluster;
    this.ecsService = ecsService;
    this.escTaskRole = ecsService.taskDefinition.taskRole;
    this.autoScalingGroup = autoScalingGroup;

    const mskClusterName = props.mskConfig?.mskClusterName;
    if (mskClusterName) {
      if (this.autoScalingGroup) {
        const autoScalingGroupRole = this.autoScalingGroup?.role;
        grantMskReadWrite(
          this,
          autoScalingGroupRole,
          mskClusterName,
          "asg-to-msk-policy"
        );
      }
    }

    // ALB
    const ports = {
      http: AppConfig.serverHttpEndpointPort(),
      https: 443,
    };
    const endpointPath = AppConfig.serverEndpointPath(scope);
    this.albSg = createALBSecurityGroup(this, props.vpc, ports);
    ecsSecurityGroup.addIngressRule(this.albSg, ec2.Port.tcp(NGINX_PORT));

    this.alb = createALB(this, {
      vpc: props.vpc,
      service: ecsService,
      sg: this.albSg,
      ports,
      endpointPath,
      httpContainerName,
      certificateArn: props.certificateArn,
    });

    // add route53 record
    if (props.hostedZoneId && props.hostedZoneName) {
      createRecordInRoute53(
        scope,
        this.alb.loadBalancerDnsName,
        props.hostedZoneId,
        props.hostedZoneName,
      );
    }
  }
}
