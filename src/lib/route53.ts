import { aws_route53 as route53, CfnOutput, Stack } from "aws-cdk-lib";
import { Construct } from "constructs";

export function createRecordInRoute53(
  scope: Construct,
  albDns: string,
  hostedZoneId: string,
  hostedZoneName: string,
) {
  const zone = getHostZone(scope, hostedZoneId, hostedZoneName);
  const record = new route53.CnameRecord(scope, "CnameAlbRecord", {
    recordName: Stack.of(scope).stackName,
    zone,
    domainName: albDns,
  });

  new CfnOutput(scope, "HostZoneDomainName", {
    value: record.domainName,
    description: "Host Zone Domain Name",
  });

  return record;
}

export function getHostZone(
  scope: Construct,
  hostedZoneId: string,
  zoneName: string
) {
  return route53.PublicHostedZone.fromHostedZoneAttributes(scope, "zone", {
      hostedZoneId,
      zoneName,
  });
}
