import * as codebuild from '@aws-cdk/aws-codebuild';
import * as codepipeline from '@aws-cdk/aws-codepipeline';
import * as codepipeline_actions from '@aws-cdk/aws-codepipeline-actions';
import { CodeBuildActionType } from '@aws-cdk/aws-codepipeline-actions';
import * as cdk from '@aws-cdk/core';

export class LumenDockerAwsCiCdInfraStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here
    const pipeline = new codepipeline.Pipeline(this, 'DevPipeline', {
      pipelineName: 'LumenDockerDevPipeline',
      crossAccountKeys: false,
    });

    const sourceOutput = new codepipeline.Artifact();
    pipeline.addStage({
      stageName: 'Source',
      actions: [
        new codepipeline_actions.BitBucketSourceAction({
          actionName: 'GitHub_Source',
          owner: 'kimisme9386',
          repo: 'lumen-docker-quick-start',
          output: sourceOutput,
          connectionArn:
            'arn:aws:codestar-connections:ap-northeast-1:482631629698:connection/6a6dd11d-2713-4129-9e5d-23289c8968d6',
          variablesNamespace: 'GitHubSourceVariables',
          branch: 'master',
        }),
      ],
    });

    const project = new codebuild.PipelineProject(
      this,
      'LumenDockerDevCodeBuild',
      {
        buildSpec: codebuild.BuildSpec.fromSourceFilename(
          'codebuild/buildspec-vm.yml'
        ),
        environment: {
          buildImage: codebuild.LinuxBuildImage.STANDARD_4_0,
          computeType: codebuild.ComputeType.SMALL,
        },
      }
    );

    const afterBuildArtifact = new codepipeline.Artifact();

    pipeline.addStage({
      stageName: 'Build',
      actions: [
        new codepipeline_actions.CodeBuildAction({
          actionName: 'AWS_CodeBuild',
          input: sourceOutput,
          project: project,
          type: CodeBuildActionType.BUILD,
          outputs: [afterBuildArtifact],
        }),
      ],
    });
  }
}
