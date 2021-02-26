#!/usr/bin/env node
import * as cdk from '@aws-cdk/core';
import 'source-map-support/register';
import { LumenDockerAwsCiCdInfraStack } from '../lib/lumen-docker-aws-ci-cd-infra-stack';

const app = new cdk.App();

const env = {
  region: app.node.tryGetContext('region') || process.env.CDK_DEFAULT_REGION,
  account: app.node.tryGetContext('account') || process.env.CDK_DEFAULT_ACCOUNT,
};

new LumenDockerAwsCiCdInfraStack(app, 'LumenDockerAwsCiCdInfraStack', { env });
