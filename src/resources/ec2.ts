import {
  DeleteFlowLogsCommand,
  DeleteInternetGatewayCommand,
  DeleteNatGatewayCommand,
  DeleteRouteTableCommand,
  DeleteSecurityGroupCommand,
  DeleteSubnetCommand,
  DeleteVpcCommand,
  DescribeAddressesCommand,
  DescribeFlowLogsCommand,
  DescribeInstanceStatusCommand,
  DescribeInstancesCommand,
  DescribeInternetGatewaysCommand,
  DescribeNatGatewaysCommand,
  DescribeNetworkInterfacesCommand,
  DescribeRouteTablesCommand,
  DescribeSecurityGroupRulesCommand,
  DescribeSecurityGroupsCommand,
  DescribeSubnetsCommand,
  DescribeVpcsCommand,
  DetachInternetGatewayCommand,
  DisassociateRouteTableCommand,
  EC2Client,
  InstanceState,
  InstanceStateName,
  InternetGateway,
  IpPermission,
  NatGateway,
  NatGatewayState,
  NetworkInterface,
  ReleaseAddressCommand,
  RevokeSecurityGroupEgressCommand,
  RevokeSecurityGroupIngressCommand,
  RouteTable,
  SecurityGroup,
  SecurityGroupRule,
  Subnet,
  TerminateInstancesCommand,
} from "@aws-sdk/client-ec2";
import { DependencyEnumeratorParams } from "../DependencyEnumerator.js";
import { ResourceDescriberParams } from "../ResourceDescriber.js";
import { ResourceDestroyerParams } from "../ResourceDestroyer.js";
import { parseArn } from "../arn.js";
import { getErrorCode } from "../awserror.js";
import logger from "../logger.js";
import { isNotNull } from "../typeUtil.js";

let client: EC2Client | undefined;

function getClient(): EC2Client {
  if (!client) {
    client = new EC2Client({});
  }
  return client;
}

export async function deleteElasticIp({ resourceId }: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const client = getClient();
  const command = new ReleaseAddressCommand({ AllocationId: resourceId });
  await client.send(command);
}

export async function describeElasticIp({ resourceId }: Pick<ResourceDescriberParams, "resourceId">): Promise<string> {
  const client = getClient();
  const command = new DescribeAddressesCommand({ AllocationIds: [resourceId] });
  const response = await client.send(command);
  const eip = response.Addresses?.[0];
  if (eip?.Tags) {
    let extra = resourceId;
    if (eip.NetworkInterfaceId) {
      const command = new DescribeNetworkInterfacesCommand({ NetworkInterfaceIds: [eip.NetworkInterfaceId] });
      const response = await client.send(command);
      const eni = response.NetworkInterfaces?.[0];
      if (eni?.Description) {
        extra += ", " + eni.Description;
      }
    }

    const name = eip.Tags.find((tag) => tag.Key === "Name")?.Value;
    if (name) {
      return `${name} (${extra})`;
    }

    if (eip.PublicIp) {
      return `${eip.PublicIp} (${extra})`;
    }
  }
  return resourceId;
}

export async function deleteFlowLogs({ resourceId }: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const client = getClient();
  const command = new DeleteFlowLogsCommand({ FlowLogIds: [resourceId] });
  try {
    await client.send(command);
  } catch (err) {
    if (getErrorCode(err) !== "InvalidFlowLogId.NotFound") throw err;
  }
}

export async function describeFlowLogs({ resourceId }: Pick<ResourceDescriberParams, "resourceId">): Promise<string> {
  const client = getClient();
  const command = new DescribeFlowLogsCommand({ FlowLogIds: [resourceId] });
  const response = await client.send(command);
  const log = response.FlowLogs?.[0];
  if (log?.Tags) {
    const name = log.Tags.find((tag) => tag.Key === "Name")?.Value;
    if (name) {
      return `${name} (${resourceId})`;
    }
  }
  if (log?.LogDestination) {
    const arn = parseArn(log.LogDestination);
    return `${log.LogDestinationType}:${arn.resourceId} (${resourceId})`;
  }
  return resourceId;
}

export async function deleteInstance({
  resourceId,
  poller,
}: Pick<ResourceDestroyerParams, "resourceId" | "poller">): Promise<void> {
  try {
    const client = getClient();
    const command = new TerminateInstancesCommand({ InstanceIds: [resourceId] });
    await client.send(command);

    await poller(
      async () => {
        const state = await describeInstanceStatus(resourceId);
        return state?.Name === InstanceStateName.terminated;
      },
      { description: `EC2 instance ${resourceId} to terminate` }
    );
  } catch (err) {
    if (getErrorCode(err) !== "InvalidInstanceID.NotFound") throw err;
  }
}

async function describeInstanceStatus(instanceId: string): Promise<InstanceState | undefined> {
  const client = getClient();
  const command = new DescribeInstanceStatusCommand({ InstanceIds: [instanceId], IncludeAllInstances: true });
  const response = await client.send(command);
  return response.InstanceStatuses?.[0].InstanceState;
}

export async function describeInstance({ resourceId }: Pick<ResourceDescriberParams, "resourceId">): Promise<string> {
  const client = getClient();
  const command = new DescribeInstancesCommand({ InstanceIds: [resourceId] });
  const response = await client.send(command);
  const instance = response.Reservations?.[0]?.Instances?.[0];
  if (instance?.Tags) {
    const name = instance.Tags.find((tag) => tag.Key === "Name")?.Value;
    if (name) {
      return `${name} (${resourceId})`;
    }
  }
  return resourceId;
}

export async function deleteInternetGateway({
  resourceId,
  poller,
}: Pick<ResourceDestroyerParams, "resourceId" | "poller">): Promise<void> {
  let vpcId: string | undefined;
  try {
    let exists = true;
    await poller(
      async () => {
        const igw = await describeInternetGateways(resourceId);
        if (!igw) {
          exists = false;
          logger.debug(`Internet gateway ${resourceId} not found`);
          return true;
        }
        if (!igw.Attachments?.length) {
          logger.debug(`Internet gateway ${resourceId} has no attachments`);
          return true;
        }
        let detaching = false;
        for (const attachment of igw.Attachments) {
          if (attachment.VpcId && attachment.State === "available") {
            vpcId = attachment.VpcId;
            logger.info(`Detaching internet gateway ${resourceId} from VPC ${attachment.VpcId}`);
            await detachInternetGateway(resourceId, attachment.VpcId);
            detaching = true;
          } else if (attachment.State === "detaching") {
            logger.debug(`Internet gateway ${resourceId} is detaching from VPC ${attachment.VpcId}`);
            detaching = true;
          } else {
            logger.debug(`Internet gateway ${resourceId} is in state "${attachment.State}"`);
          }
        }
        return !detaching;
      },
      { description: `internet gateway ${resourceId} to detach` }
    );

    if (exists) {
      const client = getClient();
      const command = new DeleteInternetGatewayCommand({ InternetGatewayId: resourceId });
      await client.send(command);
    }
  } catch (err) {
    if (getErrorCode(err) === "DependencyViolation" && vpcId != null) {
      const nis = await describeNetworkInterfaces("vpc-id", vpcId);
      const publicNis = nis.filter((ni) => ni.Association?.PublicIp != null);
      const summary = summarizeNetworkInterfaces(publicNis);
      throw new Error(`Internet gateway ${resourceId} has dependent network interfaces: ${summary}`);
    }
    throw err;
  }
}

async function describeInternetGateways(gatewayId: string): Promise<InternetGateway | undefined> {
  const client = getClient();
  const command = new DescribeInternetGatewaysCommand({ InternetGatewayIds: [gatewayId] });
  const response = await client.send(command);
  return response.InternetGateways?.[0];
}

async function detachInternetGateway(gatewayId: string, vpcId: string): Promise<void> {
  const client = getClient();
  const command = new DetachInternetGatewayCommand({ InternetGatewayId: gatewayId, VpcId: vpcId });
  await client.send(command);
}

export async function deleteNatGateway({
  resourceId,
  poller,
}: Pick<ResourceDestroyerParams, "resourceId" | "poller">): Promise<void> {
  try {
    const client = getClient();
    const command = new DeleteNatGatewayCommand({ NatGatewayId: resourceId });
    await client.send(command);

    await poller(
      async () => {
        const ngw = (await describeNatGateways([resourceId]))[0];
        return !ngw || ngw.State === NatGatewayState.DELETED;
      },
      { description: `NAT gateway ${resourceId} to be deleted` }
    );
  } catch (err) {
    if (getErrorCode(err) !== "NatGatewayNotFound") throw err;
  }
}

export async function describeNatGateway({ resourceId }: Pick<ResourceDescriberParams, "resourceId">): Promise<string> {
  try {
    const ngw = (await describeNatGateways([resourceId]))[0];
    if (ngw.SubnetId) {
      return `${resourceId} (${await describeSubnet({ resourceId: ngw.SubnetId })})`;
    }
  } catch (err) {
    if (getErrorCode(err) !== "NatGatewayNotFound") throw err;
  }
  return resourceId;
}

async function describeNatGateways(natGatewayIds: string[]): Promise<NatGateway[]> {
  const client = getClient();
  const command = new DescribeNatGatewaysCommand({ NatGatewayIds: natGatewayIds });
  const response = await client.send(command);
  return response.NatGateways || [];
}

async function describeNetworkInterfaces(filterName: string, filterValue: string): Promise<NetworkInterface[]> {
  const client = getClient();
  const command = new DescribeNetworkInterfacesCommand({ Filters: [{ Name: filterName, Values: [filterValue] }] });
  const response = await client.send(command);
  return response.NetworkInterfaces || [];
}

function summarizeNetworkInterfaces(nis: NetworkInterface[]): string {
  return (
    nis
      .map((ni) => {
        if (ni.Association?.PublicIp) {
          return `public IP ${ni.Association.PublicIp}`;
        }
        if (ni.PrivateIpAddress) {
          return `private IP ${ni.PrivateIpAddress}`;
        }
        return ni.NetworkInterfaceId;
      })
      .join(", ") || "none found"
  );
}

export async function deleteRouteTable({
  resourceId,
  poller,
}: Pick<ResourceDestroyerParams, "resourceId" | "poller">): Promise<void> {
  try {
    let exists = true;
    await poller(
      async () => {
        const rtb = (await describeRouteTables([resourceId]))[0];
        if (!rtb) {
          exists = false;
          logger.debug(`Route table ${resourceId} not found`);
          return true;
        }
        if (!rtb.Associations?.length) {
          logger.debug(`Route table ${resourceId} has no associations`);
          return true;
        }
        let disassociating = false;
        for (const association of rtb.Associations) {
          if (association.RouteTableAssociationId && association.AssociationState?.State === "associated") {
            logger.info(
              `Disassociating route table ${resourceId} from ${association.GatewayId || association.SubnetId}`
            );
            await disassociateRouteTable(association.RouteTableAssociationId);
            disassociating = true;
          } else if (association.AssociationState?.State === "disassociating") {
            logger.debug(
              `Route table ${resourceId} is disassociating from ${association.GatewayId || association.SubnetId}`
            );
            disassociating = true;
          }
        }
        return !disassociating;
      },
      { description: `route table ${resourceId} to disassociate` }
    );

    if (exists) {
      const client = getClient();
      const command = new DeleteRouteTableCommand({ RouteTableId: resourceId });
      await client.send(command);
    }
  } catch (err) {
    if (getErrorCode(err) !== "InvalidRouteTableID.NotFound") throw err;
  }
}

export async function describeRouteTable({ resourceId }: Pick<ResourceDescriberParams, "resourceId">): Promise<string> {
  try {
    const rtb = (await describeRouteTables([resourceId]))[0];
    if (rtb?.Tags) {
      const name = rtb.Tags.find((tag) => tag.Key === "Name")?.Value;
      if (name) {
        return `${name} (${resourceId})`;
      }
    }
    if (rtb?.Associations?.length) {
      const subnetIds = rtb.Associations.map((assoc) => assoc.SubnetId) as string[];
      const subnets = await describeSubnets(subnetIds);
      const subnetDescs = subnets.map((subnet) => getSubnetDescription(subnet));
      return `${resourceId} (${subnetDescs.join(", ")})`;
    }
  } catch (err) {
    if (getErrorCode(err) !== "InvalidRouteTableID.NotFound") throw err;
  }
  return resourceId;
}

async function describeRouteTables(routeTableIds: string[]): Promise<RouteTable[]> {
  const client = getClient();
  const command = new DescribeRouteTablesCommand({ RouteTableIds: routeTableIds });
  const response = await client.send(command);
  return response.RouteTables || [];
}

async function disassociateRouteTable(associationId: string): Promise<void> {
  const client = getClient();
  const command = new DisassociateRouteTableCommand({ AssociationId: associationId });
  await client.send(command);
}

export async function deleteSecurityGroup({ resourceId }: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  try {
    const client = getClient();
    const command = new DeleteSecurityGroupCommand({ GroupId: resourceId });
    await client.send(command);
  } catch (err) {
    if (getErrorCode(err) === "DependencyViolation") {
      const summary = summarizeNetworkInterfaces(await describeNetworkInterfaces("group-id", resourceId));
      throw new Error(`Security group ${resourceId} has dependent network interfaces: ${summary}`);
    }
    throw err;
  }
}

export async function describeSecurityGroup({
  resourceId,
}: Pick<ResourceDescriberParams, "resourceId">): Promise<string> {
  const sg = (await describeSecurityGroups([resourceId]))[0];
  return sg?.GroupName ? `${sg.GroupName} (${resourceId})` : resourceId;
}

async function describeSecurityGroups(groupIds: string[]): Promise<SecurityGroup[]> {
  const client = getClient();
  const command = new DescribeSecurityGroupsCommand({ GroupIds: groupIds });
  const response = await client.send(command);
  return response.SecurityGroups || [];
}

export async function getSecurityGroupDependencies({
  resourceId,
}: Pick<DependencyEnumeratorParams, "resourceId">): Promise<string[]> {
  const fullDeps = new Set<string>([resourceId]);
  const sg = (await describeSecurityGroups([resourceId]))[0];
  if (sg) {
    const { VpcId } = sg;
    for (let depGroups = [sg]; ; ) {
      const newDeps: string[] = [];
      for (const depGroup of depGroups) {
        addSecurityGroupDependencies(depGroup.IpPermissions, VpcId, fullDeps, newDeps);
        addSecurityGroupDependencies(depGroup.IpPermissionsEgress, VpcId, fullDeps, newDeps);
      }
      if (!newDeps.length) break;
      depGroups = await describeSecurityGroups(newDeps);
    }
  }
  fullDeps.delete(resourceId);
  return Array.from(fullDeps);
}

function addSecurityGroupDependencies(
  IpPermissions: IpPermission[] | undefined,
  VpcId: string | undefined,
  fullDeps: Set<string>,
  newDeps: string[]
) {
  if (IpPermissions) {
    for (const ipp of IpPermissions) {
      if (ipp.UserIdGroupPairs) {
        for (const gp of ipp.UserIdGroupPairs) {
          const { GroupId: groupId } = gp;
          if (groupId && gp.VpcId === VpcId && !fullDeps.has(groupId)) {
            fullDeps.add(groupId);
            newDeps.push(groupId);
          }
        }
      }
    }
  }
}

export async function deleteSecurityGroupRules({
  resourceId,
}: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const rules = await describeSecurityGroupRules(resourceId);
  const ingressRuleIds = rules
    .filter((r) => !r.IsEgress)
    .map((r) => r.SecurityGroupRuleId)
    .filter(isNotNull);
  if (ingressRuleIds.length > 0) {
    revokeSecurityGroupIngress(resourceId, ingressRuleIds);
  }
  const egressRuleIds = rules
    .filter((r) => r.IsEgress)
    .map((r) => r.SecurityGroupRuleId)
    .filter(isNotNull);
  if (egressRuleIds.length > 0) {
    revokeSecurityGroupEgress(resourceId, egressRuleIds);
  }
}

async function describeSecurityGroupRules(groupId: string): Promise<SecurityGroupRule[]> {
  const client = getClient();
  const command = new DescribeSecurityGroupRulesCommand({ Filters: [{ Name: "group-id", Values: [groupId] }] });
  const response = await client.send(command);
  return response.SecurityGroupRules || [];
}

async function revokeSecurityGroupIngress(GroupId: string, SecurityGroupRuleIds: string[]): Promise<void> {
  const client = getClient();
  const command = new RevokeSecurityGroupIngressCommand({ GroupId, SecurityGroupRuleIds });
  await client.send(command);
}

async function revokeSecurityGroupEgress(GroupId: string, SecurityGroupRuleIds: string[]): Promise<void> {
  const client = getClient();
  const command = new RevokeSecurityGroupEgressCommand({ GroupId, SecurityGroupRuleIds });
  await client.send(command);
}

export async function deleteSubnet({ resourceId }: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  try {
    const client = getClient();
    const command = new DeleteSubnetCommand({ SubnetId: resourceId });
    await client.send(command);
  } catch (err) {
    if (getErrorCode(err) === "DependencyViolation") {
      const summary = summarizeNetworkInterfaces(await describeNetworkInterfaces("subnet-id", resourceId));
      throw new Error(`Subnet ${resourceId} has dependent network interfaces: ${summary}`);
    }
    throw err;
  }
}

export async function describeSubnet({ resourceId }: Pick<ResourceDescriberParams, "resourceId">): Promise<string> {
  const subnet = (await describeSubnets([resourceId]))[0];
  return subnet ? getSubnetDescription(subnet, resourceId) : resourceId;
}

function getSubnetDescription(subnet: Subnet, resourceId = subnet.SubnetId): string {
  if (subnet?.Tags) {
    const name = subnet.Tags.find((tag) => tag.Key === "Name")?.Value;
    if (name) {
      return `${name} (${resourceId})`;
    }
  }
  return String(resourceId);
}

async function describeSubnets(subnetIds: string[]): Promise<Subnet[]> {
  const client = getClient();
  const command = new DescribeSubnetsCommand({ SubnetIds: subnetIds });
  const response = await client.send(command);
  return response.Subnets || [];
}

export async function deleteVpc({ resourceId }: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const sgs = await describeVpcSecurityGroups(resourceId);
  for (const sg of sgs) {
    if (sg.GroupId && sg.GroupName !== "default") {
      logger.debug(`Deleting rules of security group ${sg.GroupId} in VPC ${resourceId}`);
      await deleteSecurityGroupRules({ resourceId: sg.GroupId });
    }
  }
  for (const sg of sgs) {
    if (sg.GroupId && sg.GroupName !== "default") {
      logger.debug(`Deleting security group ${sg.GroupId} in VPC ${resourceId}`);
      await deleteSecurityGroup({ resourceId: sg.GroupId });
    }
  }

  const client = getClient();
  const command = new DeleteVpcCommand({ VpcId: resourceId });
  try {
    await client.send(command);
  } catch (err) {
    console.log(err);
    if (getErrorCode(err) !== "InvalidVpcID.NotFound") throw err;
  }
}

export async function describeVpc({ resourceId }: Pick<ResourceDescriberParams, "resourceId">): Promise<string> {
  const client = getClient();
  const command = new DescribeVpcsCommand({ VpcIds: [resourceId] });
  const response = await client.send(command);
  const vpc = response.Vpcs?.[0];
  if (vpc?.Tags) {
    const name = vpc.Tags.find((tag) => tag.Key === "Name")?.Value;
    if (name) {
      return `${name} (${resourceId})`;
    }
  }
  return resourceId;
}

async function describeVpcSecurityGroups(vpcId: string): Promise<SecurityGroup[]> {
  const client = getClient();
  const command = new DescribeSecurityGroupsCommand({ Filters: [{ Name: "vpc-id", Values: [vpcId] }] });
  const response = await client.send(command);
  return response.SecurityGroups || [];
}
