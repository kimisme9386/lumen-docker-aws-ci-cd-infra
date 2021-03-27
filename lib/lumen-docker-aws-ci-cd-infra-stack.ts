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
        cache: codebuild.Cache.local(codebuild.LocalCacheMode.CUSTOM),
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

    const githubPersonalToken = ssm.StringParameter.valueFromLookup(
      this,
      '/codepipeline/github-personal-token'
    );

    const badgeBucket = new s3.Bucket(this, 'BadgeBucket', {
      publicReadAccess: true,
    });

    const badgeBucketImageKeyName = `${branchName}-latest-build.svg`;
    const targetLambda = this.createCodePipelineEventLambdaFunction(
      branchName,
      `https://hooks.slack.com/services${slackWebhookPath}`,
      badgeBucket.bucketName,
      badgeBucketImageKeyName,
      pipeline.pipelineName,
      githubPersonalToken
    );

    badgeBucket.grantReadWrite(targetLambda);
    new cdk.CfnOutput(this, 'badgeMarkdownLink', {
      value: `[![Build Status](https://${badgeBucket.bucketName}.s3-ap-northeast-1.amazonaws.com/${badgeBucketImageKeyName}#1)](https://ap-northeast-1.console.aws.amazon.com/codesuite/codepipeline/pipelines/${pipeline.pipelineName}/view)`,
    });

    targetLambda.role?.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        'AWSCodePipeline_ReadOnlyAccess'
      )
    );

    pipeline.onStateChange('CodePipelineChange', {
      eventPattern: {
        source: ['aws.codepipeline'],
        detailType: ['CodePipeline Pipeline Execution State Change'],
      },
      target: new targets.LambdaFunction(targetLambda),
    });

    // CodeBuild exclude deploy of codepipeline
    const codeBuildProjectExcludeDeploy = new codebuild.Project(
      this,
      'LumenDockerDevCodeBuildExcludeDeploy',
      {
        buildSpec: codebuild.BuildSpec.fromSourceFilename(
          'codebuild/buildspec-vm.yml'
        ),
        source: codebuild.Source.gitHub({
          owner: 'kimisme9386',
          repo: 'lumen-docker-quick-start',
          webhook: true, // optional, default: true if `webhookFilters` were provided, false otherwise
          webhookTriggersBatchBuild: false, // optional, default is false
          webhookFilters: [
            codebuild.FilterGroup.inEventOf(
              codebuild.EventAction.PUSH
            ).andCommitMessageIs('\\[CodeBuild\\]'),
            codebuild.FilterGroup.inEventOf(
              codebuild.EventAction.PULL_REQUEST_MERGED
            ).andBaseRefIsNot(`refs/heads/${branchName}`),
            codebuild.FilterGroup.inEventOf(
              codebuild.EventAction.PULL_REQUEST_CREATED,
              codebuild.EventAction.PULL_REQUEST_UPDATED
            ),
          ],
          reportBuildStatus: true,
        }),
        badge: true,
        environment: {
          buildImage: codebuild.LinuxBuildImage.STANDARD_4_0,
          computeType: codebuild.ComputeType.SMALL,
        },
        cache: codebuild.Cache.local(codebuild.LocalCacheMode.CUSTOM),
      }
    );

    const targetCodeBuildLambda = this.createCodeBuildEventLambdaFunction(
      branchName,
      `https://hooks.slack.com/services${slackWebhookPath}`
    );

    codeBuildProjectExcludeDeploy.onStateChange('CodeBuildChange', {
      target: new targets.LambdaFunction(targetCodeBuildLambda),
    });
  }

  tagResource(scope: cdk.Construct): void {
    // ref: https://github.com/aws/aws-cdk/issues/4134
    Tags.of(scope).add('CDK-CfnStackId', Aws.STACK_ID);
    Tags.of(scope).add('CDK-CfnStackName', Aws.STACK_NAME);
  }

  createCodePipelineEventLambdaFunction(
    stage: string,
    slackWebhookURL: string,
    badgeBucketName: string,
    badgeBucketImageKeyName: string,
    codePipelineName: string,
    githubPersonalToken: string
  ): lambda.Function {
    const lambdaFunc = new lambda.Function(this, 'CodepipelineEventLambda', {
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../lambda/codepipeline-event'),
        {
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
        }
      ),
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'dist/codepipelineEventLambda.handler',
      environment: {
        STAGE: stage,
        SLACK_WEBHOOK_URL: slackWebhookURL,
        BADGE_BUCKET_NAME: badgeBucketName,
        BADGE_BUCKET_IMAGE_KEY_NAME: badgeBucketImageKeyName,
        CODE_PIPELINE_NAME: codePipelineName,
        GITHUB_PERSONAL_TOKEN: githubPersonalToken,
      },
    });

    this.tagResource(lambdaFunc);

    return lambdaFunc;
  }

  createCodeBuildEventLambdaFunction(
    stage: string,
    slackWebhookURL: string
  ): lambda.Function {
    const lambdaFunc = new lambda.Function(this, 'CodeBuildEventLambda', {
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../lambda/codebuild-event'),
        {
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
        }
      ),
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'dist/codeBuildEventLambda.handler',
      environment: {
        STAGE: stage,
        SLACK_WEBHOOK_URL: slackWebhookURL,
      },
    });

    this.tagResource(lambdaFunc);

    return lambdaFunc;
  }
}
