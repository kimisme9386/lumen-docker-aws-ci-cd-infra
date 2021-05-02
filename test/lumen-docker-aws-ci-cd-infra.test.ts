import { SynthUtils } from '@aws-cdk/assert';
import * as cdk from '@aws-cdk/core';
import * as LumenDockerAwsCiCdInfra from '../src/lumen-docker-aws-ci-cd-infra-stack';

test('snapshot validation', () => {
  const app = new cdk.App();
  // WHEN
  const stack = new LumenDockerAwsCiCdInfra.LumenDockerAwsCiCdInfraStack(
    app,
    'MyTestStack'
  );

  expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
});
