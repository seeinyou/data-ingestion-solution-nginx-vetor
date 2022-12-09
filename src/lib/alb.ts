import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as targets from "aws-cdk-lib/aws-elasticloadbalancingv2-targets";
import { Construct } from "constructs";
import { SecurityGroup } from "aws-cdk-lib/aws-ec2";
import { CfnOutput } from "aws-cdk-lib";
import { getALBSubnets } from "./vpc";

export const NGINX_PORT = 8088;

function addECSTargetsToListener(
  scope: Construct,
  service: ecs.Ec2Service | ecs.FargateService,
  listener: elbv2.ApplicationListener,
  endpointPath: string,
  nginxContainerName: string
) {
  const targetGroup = listener.addTargets("ECS", {
    protocol: elbv2.ApplicationProtocol.HTTP,
    port: NGINX_PORT,
    targets: [
      service.loadBalancerTarget({
        containerName: nginxContainerName,
        containerPort: NGINX_PORT,
      }),
    ],
    healthCheck: {
      enabled: true,
      protocol: elbv2.Protocol.HTTP,
      port: NGINX_PORT.toString(),
      path: "/health",
      interval: cdk.Duration.seconds(10),
      timeout: cdk.Duration.seconds(6),
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 5,
    },
  });
  
  addActionRules(listener, endpointPath, targetGroup, "forwardToECS");
}
export interface ALBProps {
  vpc: ec2.IVpc;
  certificateArn?: string;
  sg: SecurityGroup;
  service: ecs.Ec2Service | ecs.FargateService;
  endpointPath: string;
  httpContainerName: string;
  ports: {
    http: number;
    https: number;
  };
}

export function createALB(scope: Construct, props: ALBProps) {
  let serverUrl = "";
  const endpointPath = props.endpointPath;
  const httpPort = props.ports.http;
  const httpsPort = props.ports.https;
  const httpContainerName = props.httpContainerName;

  const alb = new elbv2.ApplicationLoadBalancer(scope, "alb", {
    loadBalancerName: cdk.Stack.of(scope).stackName,
    vpc: props.vpc,
    internetFacing: true,
    securityGroup: props.sg,
    vpcSubnets: getALBSubnets(props.vpc),
  });

  if (props.certificateArn) {
    const httpsListener = alb.addListener("HTTPSListener", {
      protocol: elbv2.ApplicationProtocol.HTTPS,
      port: httpsPort,
    });
    httpsListener.addCertificates("Certificate", [
      elbv2.ListenerCertificate.fromArn(props.certificateArn),
    ]);
    addECSTargetsToListener(
      scope,
      props.service,
      httpsListener,
      endpointPath,
      httpContainerName
    );
    serverUrl = `https://${alb.loadBalancerDnsName}${endpointPath}`;

    const HttpRedirectListener = alb.addListener("HttpRedirectListener", {
      protocol: elbv2.ApplicationProtocol.HTTP,
      port: httpPort,
    });

    HttpRedirectListener.addAction("RedirectToHTTPS", {
      action: elbv2.ListenerAction.redirect({
        protocol: elbv2.ApplicationProtocol.HTTPS,
        port: `${httpsPort}`,
      }),
    });
  } else {
    const httpListener = alb.addListener("Listener", {
      protocol: elbv2.ApplicationProtocol.HTTP,
      port: httpPort,
    });
    addECSTargetsToListener(
      scope,
      props.service,
      httpListener,
      endpointPath,
      httpContainerName
    );

    if (httpPort != 80) {
      serverUrl = `http://${alb.loadBalancerDnsName}:${httpPort}${endpointPath}`;
    } else {
      serverUrl = `http://${alb.loadBalancerDnsName}${endpointPath}`;
    }
  }
  new CfnOutput(scope, "ServerURL", {
    value: serverUrl,
    description: "Server URL",
  });
  return alb;
}

export interface AlbWithLambdaServerProps {
  vpc: ec2.IVpc;
  certificateArn?: string;
  sg: SecurityGroup;
  lambdaServer: lambda.Function;
  endpointPath: string;
  ports: {
    http: number;
    https: number;
  };
}

export function createALBWithLambdaServer(
  scope: Construct,
  props: AlbWithLambdaServerProps
) {
  let serverUrl = "";
  const endpointPath = props.endpointPath;
  const httpPort = props.ports.http;
  const httpsPort = props.ports.https;
  const lambdaServer = props.lambdaServer;

  const alb = new elbv2.ApplicationLoadBalancer(scope, "lambda-alb", {
    loadBalancerName: cdk.Stack.of(scope).stackName,
    vpc: props.vpc,
    internetFacing: true,
    securityGroup: props.sg,
    vpcSubnets: getALBSubnets(props.vpc),
  });

  if (props.certificateArn) {
    const httpsListener = alb.addListener("HTTPSListener", {
      protocol: elbv2.ApplicationProtocol.HTTPS,
      port: httpsPort,
    });
    httpsListener.addCertificates("Certificate", [
      elbv2.ListenerCertificate.fromArn(props.certificateArn),
    ]);
    addLambdaTargetsToListener(
      scope,
      lambdaServer,
      httpsListener,
      endpointPath
    );
    serverUrl = `https://${alb.loadBalancerDnsName}${endpointPath}`;

    const HttpRedirectListener = alb.addListener("HttpRedirectListener", {
      protocol: elbv2.ApplicationProtocol.HTTP,
      port: httpPort,
    });

    HttpRedirectListener.addAction("RedirectToHTTPS", {
      action: elbv2.ListenerAction.redirect({
        protocol: elbv2.ApplicationProtocol.HTTPS,
        port: `${httpsPort}`,
      }),
    });
  } else {
    const httpListener = alb.addListener("Listener", {
      protocol: elbv2.ApplicationProtocol.HTTP,
      port: httpPort,
    });
    addLambdaTargetsToListener(scope, lambdaServer, httpListener, endpointPath);

    if (httpPort != 80) {
      serverUrl = `http://${alb.loadBalancerDnsName}:${httpPort}${endpointPath}`;
    } else {
      serverUrl = `http://${alb.loadBalancerDnsName}${endpointPath}`;
    }
  }
  new CfnOutput(scope, "ServerURL", {
    value: serverUrl,
    description: "Server URL",
  });
  return alb;
}

function addLambdaTargetsToListener(
  scope: Construct,
  lambdaFunction: lambda.Function,
  listener: elbv2.ApplicationListener,
  endpointPath: string
) {
  const targetGroup = listener.addTargets("Targets", {
    targets: [new targets.LambdaTarget(lambdaFunction)],
    healthCheck: {
      enabled: true,
      path: "/health",
      interval: cdk.Duration.seconds(60),
      timeout: cdk.Duration.seconds(10),
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 2,
    },
  });
  addActionRules(listener, endpointPath, targetGroup, "forwardToLambda");

}

function addActionRules(listener: elbv2.ApplicationListener, endpointPath: string, 
  targetGroup: elbv2.ApplicationTargetGroup, forwardRuleName: string  ) {

  listener.addAction(forwardRuleName, {
    priority: 1,
    conditions: [
      elbv2.ListenerCondition.pathPatterns([`${endpointPath}*`, "/health"]),
    ],
    action: elbv2.ListenerAction.forward([targetGroup]),
  });
  
  listener.addAction("DefaultAction", {
    action: elbv2.ListenerAction.fixedResponse(403, {
      contentType: "text/plain",
      messageBody: "DefaultAction: Invalid request",
    }),
  });
  listener.connections.allowDefaultPortFromAnyIpv4("Open to the world");
}
