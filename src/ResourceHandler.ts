import { DependencyEnumerator } from "./DependencyEnumerator.js";
import { ResourceDescriber } from "./ResourceDescriber.js";
import { ResourceDestroyer } from "./ResourceDestroyer.js";
import { deleteCloudFrontDistribution } from "./resources/cloudfront.js";
import { deleteCloudWatchAlarm } from "./resources/cloudwatch.js";
import {
  deleteElasticIp,
  deleteFlowLogs,
  deleteInstance,
  deleteInternetGateway,
  deleteNatGateway,
  deleteRouteTable,
  deleteSecurityGroup,
  deleteSecurityGroupRules,
  deleteSubnet,
  deleteVpc,
  deleteVpcEndpoint,
  describeElasticIp,
  describeFlowLogs,
  describeInstance,
  describeNatGateway,
  describeRouteTable,
  describeSecurityGroup,
  describeSubnet,
  describeVpc,
} from "./resources/ec2.js";
import { deleteRepository } from "./resources/ecr.js";
import {
  deleteCluster,
  deleteContainerInstance,
  deleteService,
  deleteTask,
  deleteTaskDefinition,
  deleteTaskDefinitionFamily,
} from "./resources/ecs.js";
import {
  deleteCacheCluster,
  deleteCacheSnapshot,
  deleteCacheSubnetGroup,
  deleteParameterGroup,
  deleteReplicationGroup,
} from "./resources/elasticache.js";
import {
  deleteListener,
  deleteListenerRule,
  deleteLoadBalancer,
  deleteTargetGroup,
} from "./resources/elasticloadbalancing.js";
import { deleteEventBridgeRule } from "./resources/eventbridge.js";
import { deleteDeliveryStream } from "./resources/firehose.js";
import { deleteInstanceProfile, deletePolicy, deleteRole } from "./resources/iam.js";
import { deleteKafkaCluster } from "./resources/kafka.js";
import { deleteKmsKey, describeKmsKey } from "./resources/kms.js";
import { deleteLocationPlaceIndex } from "./resources/location.js";
import { deleteLogGroup } from "./resources/logs.js";
import {
  deleteDatabaseCluster,
  deleteDatabaseClusterParameterGroup,
  deleteDatabaseClusterSnapshot,
  deleteDatabaseInstance,
  deleteDatabaseSubnetGroup,
} from "./resources/rds.js";
import { deleteHostedZone } from "./resources/route53.js";
import { deleteBucket } from "./resources/s3.js";
import { deleteSecret } from "./resources/secretsmanager.js";
import {
  deleteDiscoveryNamespace,
  deleteDiscoveryService,
  describeDiscoveryNamespace,
} from "./resources/servicediscovery.js";
import { deleteSnsTopic } from "./resources/sns.js";
import { ResourceType, ec2SecurityGroupRules, ecsTaskDefinitionFamily } from "./ResourceType.js";

export interface ResourceHandler {
  kind: string;
  describer?: ResourceDescriber;
  dependencyEnumerator?: DependencyEnumerator;
  destroyer?: ResourceDestroyer;
}

const resourceHandlers: Record<ResourceType, ResourceHandler> = {
  "cloudfront.distribution": {
    kind: "CloudFront Distribution",
    destroyer: deleteCloudFrontDistribution,
  },
  "cloudwatch.alarm": {
    kind: "CloudWatch Alarm",
    destroyer: deleteCloudWatchAlarm,
  },
  "ec2.elastic-ip": {
    kind: "EC2 Elastic IP",
    describer: describeElasticIp,
    destroyer: deleteElasticIp,
  },
  "ec2.instance": {
    kind: "EC2 Instance",
    describer: describeInstance,
    destroyer: deleteInstance,
  },
  "ec2.internet-gateway": {
    kind: "EC2 Internet Gateway",
    destroyer: deleteInternetGateway,
  },
  "ec2.natgateway": {
    kind: "EC2 NAT Gateway",
    describer: describeNatGateway,
    destroyer: deleteNatGateway,
  },
  "ec2.route-table": {
    kind: "EC2 Route Table",
    describer: describeRouteTable,
    destroyer: deleteRouteTable,
  },
  "ec2.security-group": {
    kind: "EC2 Security Group",
    describer: describeSecurityGroup,
    destroyer: deleteSecurityGroup,
  },
  [ec2SecurityGroupRules]: {
    kind: "EC2 Security Group Rules",
    describer: describeSecurityGroup,
    destroyer: deleteSecurityGroupRules,
  },
  "ec2.subnet": {
    kind: "EC2 Subnet",
    describer: describeSubnet,
    destroyer: deleteSubnet,
  },
  "ec2.vpc": {
    kind: "VPC",
    describer: describeVpc,
    destroyer: deleteVpc,
  },
  "ec2.vpc-endpoint": {
    kind: "VPC Endpoint",
    destroyer: deleteVpcEndpoint,
  },
  "ec2.vpc-flow-log": {
    kind: "VPC Flow Log",
    describer: describeFlowLogs,
    destroyer: deleteFlowLogs,
  },
  "ecr.repository": {
    kind: "ECR Repository",
    destroyer: deleteRepository,
  },
  "ecs.cluster": {
    kind: "ECS Cluster",
    destroyer: deleteCluster,
  },
  "ecs.container-instance": {
    kind: "ECS Container Instance",
    destroyer: deleteContainerInstance,
  },
  "ecs.service": {
    kind: "ECS Service",
    destroyer: deleteService,
  },
  "ecs.task": {
    kind: "ECS Task",
    destroyer: deleteTask,
  },
  "ecs.task-definition": {
    kind: "ECS Task Definition",
    destroyer: deleteTaskDefinition,
  },
  [ecsTaskDefinitionFamily]: {
    kind: "ECS Task Definition Family",
    destroyer: deleteTaskDefinitionFamily,
  },
  "elasticache.cluster": {
    kind: "ElastiCache Cluster",
    destroyer: deleteCacheCluster,
  },
  "elasticache.parametergroup": {
    kind: "ElastiCache Parameter Group",
    destroyer: deleteParameterGroup,
  },
  "elasticache.replicationgroup": {
    kind: "ElastiCache Replication Group",
    destroyer: deleteReplicationGroup,
  },
  "elasticache.snapshot": {
    kind: "ElastiCache Snapshot",
    destroyer: deleteCacheSnapshot,
  },
  "elasticache.subnetgroup": {
    kind: "ElastiCache Subnet Group",
    destroyer: deleteCacheSubnetGroup,
  },
  "elasticloadbalancing.listener": {
    kind: "ELB Listener",
    destroyer: deleteListener,
  },
  "elasticloadbalancing.listener-rule": {
    kind: "ELB Listener Rule",
    destroyer: deleteListenerRule,
  },
  "elasticloadbalancing.loadbalancer": {
    kind: "ELB Load Balancer",
    destroyer: deleteLoadBalancer,
  },
  "elasticloadbalancing.targetgroup": {
    kind: "ELB Target Group",
    destroyer: deleteTargetGroup,
  },
  "events.rule": {
    kind: "EventBridge Rule",
    destroyer: deleteEventBridgeRule,
  },
  "firehose.deliverystream": {
    kind: "Kinesis Firehose Delivery Stream",
    destroyer: deleteDeliveryStream,
  },
  "geo.place-index": {
    kind: "Amazon Location Service Place Index",
    destroyer: deleteLocationPlaceIndex,
  },
  "iam.instance-profile": {
    kind: "IAM Instance Profile",
    destroyer: deleteInstanceProfile,
  },
  "iam.policy": {
    kind: "IAM Policy",
    destroyer: deletePolicy,
  },
  "iam.role": {
    kind: "IAM Role",
    destroyer: deleteRole,
  },
  "kafka.cluster": {
    kind: "Kafka Cluster",
    destroyer: deleteKafkaCluster,
  },
  "kms.key": {
    kind: "KMS Key",
    describer: describeKmsKey,
    destroyer: deleteKmsKey,
  },
  "logs.log-group": {
    kind: "CloudWatch Log Group",
    destroyer: deleteLogGroup,
  },
  "rds.cluster": {
    kind: "RDS Cluster",
    destroyer: deleteDatabaseCluster,
  },
  "rds.cluster-pg": {
    kind: "RDS Cluster Parameter Group",
    destroyer: deleteDatabaseClusterParameterGroup,
  },
  "rds.cluster-snapshot": {
    kind: "RDS Cluster Snapshot",
    destroyer: deleteDatabaseClusterSnapshot,
  },
  "rds.db": {
    kind: "RDS Database",
    destroyer: deleteDatabaseInstance,
  },
  "rds.subgrp": {
    kind: "RDS Subnet Group",
    destroyer: deleteDatabaseSubnetGroup,
  },
  "route53.hostedzone": {
    kind: "Route 53 Hosted Zone",
    destroyer: deleteHostedZone,
  },
  s3: {
    kind: "S3 Bucket",
    destroyer: deleteBucket,
  },
  "secretsmanager.secret": {
    kind: "Secrets Manager Secret",
    destroyer: deleteSecret,
  },
  "servicediscovery.namespace": {
    kind: "Service Discovery Namespace",
    describer: describeDiscoveryNamespace,
    destroyer: deleteDiscoveryNamespace,
  },
  "servicediscovery.service": {
    kind: "Service Discovery Service",
    destroyer: deleteDiscoveryService,
  },
  sns: {
    kind: "SNS Topic",
    destroyer: deleteSnsTopic,
  },
};

export function getResourceHandler(resourceType: ResourceType): ResourceHandler {
  return resourceHandlers[resourceType];
}
