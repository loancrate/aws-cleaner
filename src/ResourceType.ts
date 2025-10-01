// synthetic resource type used delete rules before groups
export const securityGroupRules = "security-group-rules";
export const ec2SecurityGroupRules = `ec2.${securityGroupRules}`;

// synthetic resource type
export const taskDefinitionFamily = "task-definition-family";
export const ecsTaskDefinitionFamily = `ecs.${taskDefinitionFamily}`;

const resourceTypes = [
  "cloudfront.distribution",
  "cloudwatch.alarm",
  "ec2.elastic-ip",
  "ec2.instance",
  "ec2.internet-gateway",
  "ec2.natgateway",
  "ec2.route-table",
  "ec2.security-group",
  ec2SecurityGroupRules,
  "ec2.subnet",
  "ec2.vpc",
  "ec2.vpc-endpoint",
  "ec2.vpc-flow-log",
  "ecr.repository",
  "ecs.cluster",
  "ecs.service",
  "ecs.task",
  "ecs.task-definition",
  ecsTaskDefinitionFamily,
  "elasticache.cluster",
  "elasticache.parametergroup",
  "elasticache.replicationgroup",
  "elasticache.snapshot",
  "elasticache.subnetgroup",
  "elasticloadbalancing.listener",
  "elasticloadbalancing.listener-rule",
  "elasticloadbalancing.loadbalancer",
  "elasticloadbalancing.targetgroup",
  "events.rule",
  "firehose.deliverystream",
  "geo.place-index",
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
  "route53.hostedzone",
  "s3",
  "secretsmanager.secret",
  "servicediscovery.namespace",
  "servicediscovery.service",
  "sns",
] as const;

const resourceTypeSet = new Set<string>(resourceTypes);

export type ResourceType = (typeof resourceTypes)[number];

export function isResourceType(s: string): s is ResourceType {
  return resourceTypeSet.has(s);
}
