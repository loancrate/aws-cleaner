import { DependencyEnumerator } from "./DependencyEnumerator.js";
import { ResourceDestroyer } from "./ResourceDestroyer.js";
import {
  deleteElasticIp,
  deleteFlowLogs,
  deleteInternetGateway,
  deleteNatGateway,
  deleteRouteTable,
  deleteSecurityGroup,
  deleteSecurityGroupRules,
  deleteSubnet,
  deleteVpc,
} from "./resources/ec2.js";
import { deleteRepository } from "./resources/ecr.js";
import {
  deleteCluster,
  deleteService,
  deleteTask,
  deleteTaskDefinition,
  deleteTaskDefinitionFamily,
} from "./resources/ecs.js";
import { deleteCacheCluster, deleteCacheSubnetGroup } from "./resources/elasticache.js";
import {
  deleteListener,
  deleteListenerRule,
  deleteLoadBalancer,
  deleteTargetGroup,
} from "./resources/elasticloadbalancing.js";
import { deleteDeliveryStream } from "./resources/firehose.js";
import { deleteInstanceProfile, deletePolicy, deleteRole } from "./resources/iam.js";
import { deleteLogGroup } from "./resources/logs.js";
import {
  deleteDatabaseCluster,
  deleteDatabaseClusterParameterGroup,
  deleteDatabaseClusterSnapshot,
  deleteDatabaseInstance,
  deleteDatabaseSubnetGroup,
} from "./resources/rds.js";
import { deleteBucket } from "./resources/s3.js";
import { deleteSecret } from "./resources/secretsmanager.js";
import { deleteDiscoveryNamespace, deleteDiscoveryService } from "./resources/servicediscovery.js";
import { ResourceType } from "./ResourceType.js";

export interface ResourceHandler {
  description: string;
  dependencyEnumerator?: DependencyEnumerator;
  destroyer?: ResourceDestroyer;
}

const resourceHandlers: Record<ResourceType, ResourceHandler> = {
  "ec2.elastic-ip": {
    description: "EC2 Elastic IP",
    destroyer: deleteElasticIp,
  },
  "ec2.internet-gateway": {
    description: "EC2 Internet Gateway",
    destroyer: deleteInternetGateway,
  },
  "ec2.natgateway": {
    description: "EC2 NAT Gateway",
    destroyer: deleteNatGateway,
  },
  "ec2.route-table": {
    description: "EC2 Route Table",
    destroyer: deleteRouteTable,
  },
  "ec2.security-group": {
    description: "EC2 Security Group",
    destroyer: deleteSecurityGroup,
  },
  "ec2.security-group-rules": {
    description: "EC2 Security Group Rules",
    destroyer: deleteSecurityGroupRules,
  },
  "ec2.subnet": {
    description: "EC2 Subnet",
    destroyer: deleteSubnet,
  },
  "ec2.vpc": {
    description: "VPC",
    destroyer: deleteVpc,
  },
  "ec2.vpc-flow-log": {
    description: "VPC Flow Log",
    destroyer: deleteFlowLogs,
  },
  "ecr.repository": {
    description: "ECR Repository",
    destroyer: deleteRepository,
  },
  "ecs.cluster": {
    description: "ECS Cluster",
    destroyer: deleteCluster,
  },
  "ecs.service": {
    description: "ECS Service",
    destroyer: deleteService,
  },
  "ecs.task": {
    description: "ECS Task",
    destroyer: deleteTask,
  },
  "ecs.task-definition": {
    description: "ECS Task Definition",
    destroyer: deleteTaskDefinition,
  },
  "ecs.task-definition-family": {
    description: "ECS Task Definition Family",
    destroyer: deleteTaskDefinitionFamily,
  },
  "elasticache.cluster": {
    description: "ElastiCache Cluster",
    destroyer: deleteCacheCluster,
  },
  "elasticache.subnetgroup": {
    description: "ElastiCache Subnet Group",
    destroyer: deleteCacheSubnetGroup,
  },
  "elasticloadbalancing.listener": {
    description: "ELB Listener",
    destroyer: deleteListener,
  },
  "elasticloadbalancing.listener-rule": {
    description: "ELB Listener Rule",
    destroyer: deleteListenerRule,
  },
  "elasticloadbalancing.loadbalancer": {
    description: "ELB Load Balancer",
    destroyer: deleteLoadBalancer,
  },
  "elasticloadbalancing.targetgroup": {
    description: "ELB Target Group",
    destroyer: deleteTargetGroup,
  },
  "firehose.deliverystream": {
    description: "Kinesis Firehose Delivery Stream",
    destroyer: deleteDeliveryStream,
  },
  "iam.instance-profile": {
    description: "IAM Instance Profile",
    destroyer: deleteInstanceProfile,
  },
  "iam.policy": {
    description: "IAM Policy",
    destroyer: deletePolicy,
  },
  "iam.role": {
    description: "IAM Role",
    destroyer: deleteRole,
  },
  "logs.log-group": {
    description: "CloudWatch Log Group",
    destroyer: deleteLogGroup,
  },
  "rds.cluster": {
    description: "RDS Cluster",
    destroyer: deleteDatabaseCluster,
  },
  "rds.cluster-pg": {
    description: "RDS Cluster Parameter Group",
    destroyer: deleteDatabaseClusterParameterGroup,
  },
  "rds.cluster-snapshot": {
    description: "RDS Cluster Snapshot",
    destroyer: deleteDatabaseClusterSnapshot,
  },
  "rds.db": {
    description: "RDS Database",
    destroyer: deleteDatabaseInstance,
  },
  "rds.subgrp": {
    description: "RDS Subnet Group",
    destroyer: deleteDatabaseSubnetGroup,
  },
  s3: {
    description: "S3 Bucket",
    destroyer: deleteBucket,
  },
  "secretsmanager.secret": {
    description: "Secrets Manager Secret",
    destroyer: deleteSecret,
  },
  "servicediscovery.namespace": {
    description: "Service Discovery Namespace",
    destroyer: deleteDiscoveryNamespace,
  },
  "servicediscovery.service": {
    description: "Service Discovery Service",
    destroyer: deleteDiscoveryService,
  },
};

export function getResourceHandler(resourceType: ResourceType): ResourceHandler {
  return resourceHandlers[resourceType];
}
