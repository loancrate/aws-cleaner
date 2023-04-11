const resourceTypes = [
  "cloudwatch.alarm",
  "ec2.elastic-ip",
  "ec2.instance",
  "ec2.internet-gateway",
  "ec2.natgateway",
  "ec2.route-table",
  "ec2.security-group",
  // synthetic resource type used delete rules before groups
  "ec2.security-group-rules",
  "ec2.subnet",
  "ec2.vpc",
  "ec2.vpc-flow-log",
  "ecr.repository",
  "ecs.cluster",
  "ecs.service",
  "ecs.task",
  "ecs.task-definition",
  // synthetic resource type
  "ecs.task-definition-family",
  "elasticache.cluster",
  "elasticache.subnetgroup",
  "elasticloadbalancing.listener",
  "elasticloadbalancing.listener-rule",
  "elasticloadbalancing.loadbalancer",
  "elasticloadbalancing.targetgroup",
  "events.rule",
  "firehose.deliverystream",
  "iam.instance-profile",
  "iam.policy",
  "iam.role",
  "kafka.cluster",
  "kms.key",
  "logs.log-group",
  "rds.cluster",
  "rds.cluster-pg",
  "rds.cluster-snapshot",
  "rds.db",
  "rds.subgrp",
  "s3",
  "secretsmanager.secret",
  "servicediscovery.namespace",
  "servicediscovery.service",
  "sns",
] as const;

const resourceTypeSet = new Set<string>(resourceTypes);

export type ResourceType = typeof resourceTypes[number];

export function isResourceType(s: string): s is ResourceType {
  return resourceTypeSet.has(s);
}
