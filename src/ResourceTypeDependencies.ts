import { ResourceType } from "./ResourceType.js";

export type ResourceTypeDependencies = Record<ResourceType, ResourceType[]>;

export const resourceTypeDependencies: ResourceTypeDependencies = {
  "ec2.elastic-ip": ["ec2.vpc"],
  "ec2.internet-gateway": ["ec2.elastic-ip"],
  "ec2.natgateway": ["ec2.subnet"],
  "ec2.route-table": ["ec2.vpc"],
  "ec2.security-group": ["ec2.vpc"],
  "ec2.subnet": ["ec2.vpc"],
  "ec2.vpc-flow-log": ["logs.log-group"],
  "ec2.vpc": [],
  "ecr.repository": [],
  "ecs.cluster": [],
  "ecs.service": ["ecs.cluster", "ecs.task-definition"],
  "ecs.task-definition": ["iam.role", "logs.log-group"],
  "elasticache.cluster": ["elasticache.subnetgroup"],
  "elasticache.subnetgroup": ["ec2.subnet"],
  "elasticloadbalancing.listener": ["elasticloadbalancing.loadbalancer", "elasticloadbalancing.targetgroup"],
  "elasticloadbalancing.loadbalancer": ["ec2.elastic-ip", "ec2.security-group", "ec2.subnet", "s3"],
  "elasticloadbalancing.targetgroup": ["ec2.vpc"],
  "iam.instance-profile": ["iam.role"],
  "iam.policy": [],
  "iam.role": ["iam.policy"],
  "logs.log-group": [],
  "rds.cluster-pg": [],
  "rds.cluster-snapshot": ["rds.cluster"],
  "rds.cluster": ["rds.cluster-pg", "rds.db"],
  "rds.db": ["rds.subgrp", "logs.log-group"],
  "rds.subgrp": ["ec2.subnet"],
  s3: ["iam.policy"],
  "secretsmanager.secret": [],
};
