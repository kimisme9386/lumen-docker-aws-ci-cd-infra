import { expect as expectCDK, matchTemplate, MatchStyle } from '@aws-cdk/assert';
import * as cdk from '@aws-cdk/core';
import * as LumenDockerAwsCiCdInfra from '../lib/lumen-docker-aws-ci-cd-infra-stack';

test('Empty Stack', () => {
    const app = new cdk.App();
    // WHEN
    const stack = new LumenDockerAwsCiCdInfra.LumenDockerAwsCiCdInfraStack(app, 'MyTestStack');
    // THEN
    expectCDK(stack).to(matchTemplate({
      'Resources': {}
    }, MatchStyle.EXACT));
});
