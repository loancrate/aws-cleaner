import {
  DeleteFlowLogsCommand,
  DeleteInternetGatewayCommand,
  DeleteNatGatewayCommand,
  DeleteRouteTableCommand,
  DeleteSecurityGroupCommand,
  DeleteSubnetCommand,
  DeleteVpcCommand,
  DescribeInternetGatewaysCommand,
  DescribeNatGatewaysCommand,
  DescribeNetworkInterfacesCommand,
  DescribeRouteTablesCommand,
  DescribeSecurityGroupRulesCommand,
  DescribeSecurityGroupsCommand,
  DetachInternetGatewayCommand,
  DisassociateRouteTableCommand,
  EC2Client,
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
} from "@aws-sdk/client-ec2";
import { getErrorCode } from "../awserror.js";
import { DependencyEnumeratorParams } from "../DependencyEnumerator.js";
import logger from "../logger.js";
import { ResourceDestroyerParams } from "../ResourceDestroyer.js";
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

export async function deleteFlowLogs({ resourceId }: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const client = getClient();
  const command = new DeleteFlowLogsCommand({ FlowLogIds: [resourceId] });
  try {
    await client.send(command);
  } catch (err) {
    if (getErrorCode(err) !== "InvalidFlowLogId.NotFound") throw err;
  }
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
        const ngw = await describeNatGateway(resourceId);
        return !ngw || ngw.State === NatGatewayState.DELETED;
      },
      { description: `NAT gateway ${resourceId} to be deleted` }
    );
  } catch (err) {
    if (getErrorCode(err) !== "NatGatewayNotFound") throw err;
  }
}

async function describeNatGateway(natGatewayId: string): Promise<NatGateway | undefined> {
  const client = getClient();
  const command = new DescribeNatGatewaysCommand({ NatGatewayIds: [natGatewayId] });
  const response = await client.send(command);
  return response.NatGateways?.[0];
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
        const rtb = await describeRouteTable(resourceId);
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

async function describeRouteTable(routeTableId: string): Promise<RouteTable | undefined> {
  const client = getClient();
  const command = new DescribeRouteTablesCommand({ RouteTableIds: [routeTableId] });
  const response = await client.send(command);
  return response.RouteTables?.[0];
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
  const sg = (await describeSecurityGroups([resourceId]))?.[0];
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

async function describeVpcSecurityGroups(vpcId: string): Promise<SecurityGroup[]> {
  const client = getClient();
  const command = new DescribeSecurityGroupsCommand({ Filters: [{ Name: "vpc-id", Values: [vpcId] }] });
  const response = await client.send(command);
  return response.SecurityGroups || [];
}
