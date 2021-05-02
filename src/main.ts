import { App } from '@aws-cdk/core';
import { LumenDockerAwsCiCdInfraStack } from './lumen-docker-aws-ci-cd-infra-stack';

// for development, use account/region from cdk cli
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const app = new App();

new LumenDockerAwsCiCdInfraStack(app, 'LumenDockerAwsCiCdInfraStack', { env });

app.synth();
