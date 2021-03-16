import * as codebuild from '@aws-cdk/aws-codebuild';
import * as codepipeline from '@aws-cdk/aws-codepipeline';
import * as codepipeline_actions from '@aws-cdk/aws-codepipeline-actions';
import { CodeBuildActionType } from '@aws-cdk/aws-codepipeline-actions';
import * as targets from '@aws-cdk/aws-events-targets';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import * as s3 from '@aws-cdk/aws-s3';
import * as ssm from '@aws-cdk/aws-ssm';
import * as cdk from '@aws-cdk/core';
import { Aws, Tags } from '@aws-cdk/core';
import * as path from 'path';

enum CodePipelineState {
  STARTED = 'STARTED',
  CANCELED = 'CANCELED',
  FAILED = 'FAILED',
  SUCCEEDED = 'SUCCEEDED',
}

export class LumenDockerAwsCiCdInfraStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const branchName = 'master';

    // The code that defines your stack goes here
    const pipeline = new codepipeline.Pipeline(this, 'DevPipeline', {
      pipelineName: 'LumenDockerDevPipeline',
      crossAccountKeys: false,
    });
    this.tagResource(pipeline);

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
          branch: branchName,
          codeBuildCloneOutput: true,
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
    this.tagResource(project);

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

    const slackWebhookPath = ssm.StringParameter.valueFromLookup(
      this,
      '/codepipeline/notification/slack-webhook-path'
    );

    const badgeBucket = new s3.Bucket(this, 'BadgeBucket', {
      publicReadAccess: true,
    });

    const badgeBucketImageKeyName = `${branchName}-latest-build.svg`;
    const targetLambda = this.createEventLambdaFunction(
      `https://hooks.slack.com/services${slackWebhookPath}`,
      badgeBucket.bucketName,
      badgeBucketImageKeyName,
      pipeline.pipelineName
    );

    badgeBucket.grantReadWrite(targetLambda);
    new cdk.CfnOutput(this, 'badgeMarkdownLink', {
      value: `[![Build Status](https://${badgeBucket.bucketName}.ap-northeast-1.amazon.com/${badgeBucketImageKeyName})](https://ap-northeast-1.console.aws.amazon.com/codesuite/codepipeline/pipelines/${pipeline.pipelineName}/view)`,
    });

    targetLambda.role?.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        'AWSCodePipeline_ReadOnlyAccess'
      )
    );

    pipeline.onStateChange('CodePipelineStateChange', {
      eventPattern: {
        source: ['aws.codepipeline'],
        detailType: ['CodePipeline Pipeline Execution State Change'],
        detail: {
          state: [
            CodePipelineState.STARTED,
            CodePipelineState.CANCELED,
            CodePipelineState.FAILED,
          ],
        },
      },
      target: new targets.LambdaFunction(targetLambda),
    });

    pipeline.onStateChange('CodePipelineActionStateChange', {
      eventPattern: {
        source: ['aws.codepipeline'],
        detailType: ['CodePipeline Stage Execution State Change'],
        detail: {
          state: [
            CodePipelineState.SUCCEEDED,
            CodePipelineState.CANCELED,
            CodePipelineState.FAILED,
          ],
        },
      },
      target: new targets.LambdaFunction(targetLambda),
    });

    pipeline.onStateChange('CodePipelineActionStateChange', {
      eventPattern: {
        source: ['aws.codepipeline'],
        detailType: ['CodePipeline Action Execution State Change'],
        detail: {
          state: [CodePipelineState.CANCELED, CodePipelineState.FAILED],
        },
      },
      target: new targets.LambdaFunction(targetLambda),
    });
  }

  tagResource(scope: cdk.Construct): void {
    // ref: https://github.com/aws/aws-cdk/issues/4134
    Tags.of(scope).add('CDK-CfnStackId', Aws.STACK_ID);
    Tags.of(scope).add('CDK-CfnStackName', Aws.STACK_NAME);
  }

  createEventLambdaFunction(
    slackWebhookURL: string,
    badgeBucketName: string,
    badgeBucketImageKeyName: string,
    codePipelineName: string
  ): lambda.Function {
    const lambdaFunc = new lambda.Function(this, 'CodepipelineEventLambda', {
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda'), {
        bundling: {
          user: 'root',
          image: lambda.Runtime.NODEJS_14_X.bundlingDockerImage,
          command: [
            'bash',
            '-c',
            [
              'npm install',
              'npm run build',
              'cp -r /asset-input/dist /asset-output/',
              'npm install --only=production',
              'cp -a /asset-input/node_modules /asset-output/',
            ].join(' && '),
          ],
        },
      }),
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'dist/codepipelineEventLambda.handler',
      environment: {
        SLACK_WEBHOOK_URL: slackWebhookURL,
        BADGE_BUCKET_NAME: badgeBucketName,
        BADGE_BUCKET_IMAGE_KEY_NAME: badgeBucketImageKeyName,
        CODE_PIPELINE_NAME: codePipelineName,
      },
    });

    this.tagResource(lambdaFunc);

    return lambdaFunc;
  }
}
