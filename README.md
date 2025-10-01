# AWS Resource Cleaner

## WARNING AND DISCLAIMER

**This software is designed to permanently delete your AWS resources.**

Configure it carefully before running and **always use dry-run mode first**.

Regardless of how you use it, this software is provided **AS-IS**,
and the authors **disclaim all warranties** with regard to this software.
In no event shall the authors be liable for any special, direct, indirect,
or consequential damages, or any damages whatsoever resulting from loss of use, data, or profits,
whether in an action of contract negligence or other tortious action arising out of
or in connection with the use or performance of this software.

## Description

AWS Resource Cleaner enumerates resources in your AWS account and deletes all resources in unwanted environments.
Environments are generally defined by an AWS tag, such as `Environment = staging`.
For most resources, the [AWS Resource Groups Tagging API](https://docs.aws.amazon.com/resourcegroupstagging/latest/APIReference/overview.html) is used to enumerate resources.
However, that API [does not support all resource types](https://docs.aws.amazon.com/resourcegroupstagging/latest/APIReference/supported-services.html).
For example, IAM roles and users are not tagged by that API, and therefore must be enumerated separately.
Additionally, for certain resources that support tagging, we also support parsing the environment from the resource name.
For example, task definitions tend to be created by tools that don't include tags,
therefore we support parsing the environment from the task definition family name.

The target environments to delete are specified in the configuration file by name or regular expression.
For extra safety, there is also a list of protected environments that won't be deleted even if they match a target environment.
Additionally, we support environments corresponding to GitHub pull requests,
in which environments for closed/merged pull requests are deleted and those for open pull requests are protected.
Finally, we also support coordinating with Terraform Cloud.
Terraform Cloud workspaces corresponding to target environments can be optionally destroyed and deleted automatically.
For workspaces that are not deleted, we will skip the corresponding environments when enumerating AWS resources.

### Supported Resource Types

AWS resource types are added as we encounter them and can test deletion of them.
The following types are currently supported:

- CloudFront
  - Distribution
- CloudWatch
  - Alarm
  - Log Group
- Elastic Compute Cloud (EC2)
  - Elastic IP
  - Instance
  - Internet Gateway
  - NAT Gateway
  - Route Table
  - Security Group
  - Subnet
  - VPC
  - VPC Endpoint
  - VPC Flow Log
- Elastic Container Registry (ECR)
  - Repository
- Elastic Container Service (ECS)
  - Cluster
  - Service
  - Task
  - Task Definition
  - Task Definition Family
- ElastiCache
  - Cluster
  - Parameter Group
  - Replication Group
  - Snapshot
  - Subnet Group
- Elastic Load Balancing (ELB)
  - Listener
  - Listener Rule
  - Load Balancer
  - Target Group
- EventBridge
  - Rule
- Identity and Access Management (IAM)
  - Instance Profile
  - Policy
  - Role
- Kafka (MSK)
  - Cluster
- Key Management Service (KMS)
  - Key
- Kinesis Firehose
  - Delivery Stream
- Location
  - Place Index
- Relational Database Service (RDS)
  - Cluster
  - Cluster Parameter Group
  - Cluster Snapshot
  - Database
  - Subnet Group
- Route 53
  - Zone
- Simple Storage Service (S3)
  - Bucket
- Secrets Manager
  - Secret
- Service Discovery
  - Namespace
  - Service
- Simple Notification Service (SNS)
  - Topic

## Installation

This application is currently designed to be run from source,
so start by cloning the repository at `https://github.com/loancrate/aws-cleaner.git`.
It requires [Node.js](https://nodejs.org/en/) 20+.
If you're using the [Node Version Manager (nvm)](https://github.com/nvm-sh/nvm), just run `nvm install`.
Then install package dependencies using `npm install`.
All together, it looks something like this:

```
git clone https://github.com/loancrate/aws-cleaner.git
cd aws-cleaner
nvm install
npm install
```

## Configuration

Copy `config/sample.yaml` to `config/default.yaml` and update the settings to match your environment.
In particular, if you're using Terraform Cloud or environments corresponding to GitHub pull requests,
you'll want to configure your access tokens, organization name, and repository.
AWS credentials should come from `~/.aws/credentials` or environment variables
(i.e. `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`).
By default, the application runs in dry-run mode, meaning it says what would be deleted instead of deleting anything.
Always run a given configuration in dry-run mode first and examine the output before running again with dry-run disabled.

## Running

```
npm start
```

## License

`aws-cleaner` is available under the [ISC license](LICENSE).
