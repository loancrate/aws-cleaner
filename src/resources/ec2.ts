import {
  DeleteFlowLogsCommand,
  DeleteInternetGatewayCommand,
  DeleteNatGatewayCommand,
  DeleteRouteTableCommand,
  DeleteSecurityGroupCommand,
  DeleteSubnetCommand,
  DeleteVpcCommand,
  DescribeInternetGatewaysCommand,
  DescribeRouteTablesCommand,
  DescribeSecurityGroupsCommand,
  DetachInternetGatewayCommand,
  DisassociateRouteTableCommand,
  EC2Client,
  InternetGateway,
  IpPermission,
  ReleaseAddressCommand,
  RouteTable,
  SecurityGroup,
} from "@aws-sdk/client-ec2";
import { setTimeout } from "timers/promises";
import { getErrorCode } from "../awserror.js";
import logger from "../logger.js";
import { ResourceDestroyerParams } from "../ResourceDestroyer.js";

const detachPollMs = 1000;

export async function deleteElasticIp({ resourceId }: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const client = new EC2Client({});
  const command = new ReleaseAddressCommand({ AllocationId: resourceId });
  await client.send(command);
}

export async function deleteFlowLogs({ resourceId }: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const client = new EC2Client({});
  const command = new DeleteFlowLogsCommand({ FlowLogIds: [resourceId] });
  try {
    await client.send(command);
  } catch (err) {
    if (getErrorCode(err) !== "InvalidFlowLogId.NotFound") throw err;
  }
}

export async function deleteInternetGateway({
  resourceId,
}: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  // TODO: unmap those public address
  // pr-1705: Error destroying EC2 Internet Gateway igw-0ca5a81e458f68a5b: Network vpc-0fca7654f1681c7ac has some mapped public address(es). Please unmap those public address(es) before detaching the gateway.
  for (;;) {
    const igw = await describeInternetGateways(resourceId);
    if (!igw) {
      logger.debug(`Internet gateway ${resourceId} not found`);
      return;
    }
    if (!igw.Attachments?.length) {
      logger.debug(`Internet gateway ${resourceId} has no attachments`);
      break;
    }
    let detaching = false;
    for (const attachment of igw.Attachments) {
      if (attachment.VpcId && attachment.State === "available") {
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
    if (!detaching) break;
    logger.debug(`Waiting for internet gateway ${resourceId} to detach`);
    await setTimeout(detachPollMs);
  }

  const client = new EC2Client({});
  const command = new DeleteInternetGatewayCommand({ InternetGatewayId: resourceId });
  await client.send(command);
}

export async function describeInternetGateways(gatewayId: string): Promise<InternetGateway | undefined> {
  const client = new EC2Client({});
  const command = new DescribeInternetGatewaysCommand({ InternetGatewayIds: [gatewayId] });
  const response = await client.send(command);
  return response.InternetGateways?.[0];
}

export async function detachInternetGateway(gatewayId: string, vpcId: string): Promise<void> {
  const client = new EC2Client({});
  const command = new DetachInternetGatewayCommand({ InternetGatewayId: gatewayId, VpcId: vpcId });
  await client.send(command);
}

export async function deleteNatGateway({ resourceId }: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const client = new EC2Client({});
  const command = new DeleteNatGatewayCommand({ NatGatewayId: resourceId });
  await client.send(command);
}

export async function deleteRouteTable({ resourceId }: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  try {
    for (;;) {
      const rtb = await describeRouteTable(resourceId);
      if (!rtb) {
        logger.debug(`Route table ${resourceId} not found`);
        return;
      }
      if (!rtb.Associations?.length) {
        logger.debug(`Route table ${resourceId} has no associations`);
        break;
      }
      let disassociating = false;
      for (const association of rtb.Associations) {
        if (association.RouteTableAssociationId && association.AssociationState?.State === "associated") {
          logger.info(`Disassociating route table ${resourceId} from ${association.GatewayId || association.SubnetId}`);
          await disassociateRouteTable(association.RouteTableAssociationId);
          disassociating = true;
        } else if (association.AssociationState?.State === "disassociating") {
          logger.debug(
            `Route table ${resourceId} is disassociating from ${association.GatewayId || association.SubnetId}`
          );
          disassociating = true;
        }
      }
      if (!disassociating) break;
      logger.debug(`Waiting for route table ${resourceId} to disassociate`);
      await setTimeout(detachPollMs);
    }

    const client = new EC2Client({});
    const command = new DeleteRouteTableCommand({ RouteTableId: resourceId });
    await client.send(command);
  } catch (err) {
    if (getErrorCode(err) !== "InvalidRouteTableID.NotFound") throw err;
  }
}

export async function describeRouteTable(routeTableId: string): Promise<RouteTable | undefined> {
  const client = new EC2Client({});
  const command = new DescribeRouteTablesCommand({ RouteTableIds: [routeTableId] });
  const response = await client.send(command);
  return response.RouteTables?.[0];
}

export async function disassociateRouteTable(associationId: string): Promise<void> {
  const client = new EC2Client({});
  const command = new DisassociateRouteTableCommand({ AssociationId: associationId });
  await client.send(command);
}

export async function deleteSecurityGroup({ resourceId }: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  await describeSecurityGroups([resourceId]);
  const client = new EC2Client({});
  const command = new DeleteSecurityGroupCommand({ GroupId: resourceId });
  await client.send(command);
}

export async function describeSecurityGroups(groupIds: string[]): Promise<SecurityGroup[]> {
  const client = new EC2Client({});
  const command = new DescribeSecurityGroupsCommand({ GroupIds: groupIds });
  const response = await client.send(command);
  logger.debug({ groupIds, SecurityGroups: response.SecurityGroups }, "describeSecurityGroups");
  return response.SecurityGroups || [];
}

export async function getSecurityGroupDependencies({
  resourceId,
}: Pick<ResourceDestroyerParams, "resourceId">): Promise<string[]> {
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

export async function deleteSubnet({ resourceId }: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const client = new EC2Client({});
  const command = new DeleteSubnetCommand({ SubnetId: resourceId });
  await client.send(command);
}

export async function deleteVpc({ resourceId }: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const client = new EC2Client({});
  const command = new DeleteVpcCommand({ VpcId: resourceId });
  try {
    await client.send(command);
  } catch (err) {
    if (getErrorCode(err) !== "InvalidVpcID.NotFound") throw err;
  }
}
