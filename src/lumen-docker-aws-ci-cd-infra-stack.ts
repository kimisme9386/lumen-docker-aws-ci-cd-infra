import * as codebuild from '@aws-cdk/aws-codebuild';
import * as codepipeline from '@aws-cdk/aws-codepipeline';
import * as codepipeline_actions from '@aws-cdk/aws-codepipeline-actions';
import { CodeBuildActionType } from '@aws-cdk/aws-codepipeline-actions';
import * as targets from '@aws-cdk/aws-events-targets';
import * as lambda from '@aws-cdk/aws-lambda';
import * as ssm from '@aws-cdk/aws-ssm';
import * as cdk from '@aws-cdk/core';
import { Aws, Tags } from '@aws-cdk/core';
import { CodePipelineStatus } from 'cdk-pipeline-status';
import * as path from 'path';

export class LumenDockerAwsCiCdInfraStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const branchName = 'master';
    const githubOwner = 'kimisme9386';
    const githubRepo = 'lumen-docker-quick-start';
    const connectionArn =
      'arn:aws:codestar-connections:ap-northeast-1:482631629698:connection/6a6dd11d-2713-4129-9e5d-23289c8968d6';

    const buildSpecPath = 'codebuild/buildspec-vm.yml';
    const buildIfIncludesCommitMessage = '\\[CodeBuild\\]';

    // Notification
    const slackWebhookPath = ssm.StringParameter.valueFromLookup(
      this,
      '/codepipeline/notification/slack-webhook-path'
    );

    const pipeline = this.createCodePipeline('LumenDockerDevPipeline');

    const sourceOutput = new codepipeline.Artifact();

    pipeline.addStage({
      stageName: 'Source',
      actions: [
        new codepipeline_actions.BitBucketSourceAction({
          actionName: 'GitHub_Source',
          owner: githubOwner,
          repo: githubRepo,
          output: sourceOutput,
          connectionArn: connectionArn,
          variablesNamespace: 'GitHubSourceVariables',
          branch: branchName,
          codeBuildCloneOutput: true,
        }),
      ],
    });

    const project = this.createCodeBuildProjectWithinCodePipeline(
      buildSpecPath
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

    new CodePipelineStatus(this, 'CodePipelineStatus', {
      pipelineArn: pipeline.pipelineArn,
      gitHubTokenFromSecretsManager: {
        secretsManagerArn:
          'arn:aws:secretsmanager:ap-northeast-1:482631629698:secret:codepipeline/lambda/github-token-YWWmII',
        secretKey: 'codepipeline/lambda/github-token',
      },
      notification: {
        stageName: 'dev',
        slackWebHookUrl: `https://hooks.slack.com/services${slackWebhookPath}`,
      },
    });

    // CodeBuild exclude deploy of codepipeline
    const codeBuildProjectExcludeDeploy = new codebuild.Project(
      this,
      'LumenDockerDevCodeBuildExcludeDeploy',
      {
        buildSpec: codebuild.BuildSpec.fromSourceFilename(buildSpecPath),
        source: codebuild.Source.gitHub({
          owner: githubOwner,
          repo: githubRepo,
          webhook: true, // optional, default: true if `webhookFilters` were provided, false otherwise
          webhookTriggersBatchBuild: false, // optional, default is false
          webhookFilters: [
            codebuild.FilterGroup.inEventOf(
              codebuild.EventAction.PUSH
            ).andCommitMessageIs(buildIfIncludesCommitMessage),
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

  private createCodeBuildProjectWithinCodePipeline(
    buildSpecPath: string,
    buildEnvironment?: codebuild.BuildEnvironment,
    buildCache?: codebuild.Cache
  ) {
    const project = new codebuild.PipelineProject(
      this,
      'LumenDockerDevCodeBuild',
      {
        buildSpec: codebuild.BuildSpec.fromSourceFilename(buildSpecPath),
        environment: buildEnvironment
          ? buildEnvironment
          : {
              buildImage: codebuild.LinuxBuildImage.STANDARD_4_0,
              computeType: codebuild.ComputeType.SMALL,
            },
        cache: buildCache
          ? buildCache
          : codebuild.Cache.local(codebuild.LocalCacheMode.CUSTOM),
      }
    );
    this.tagResource(project);
    return project;
  }

  private createCodePipeline(name: string) {
    const pipeline = new codepipeline.Pipeline(this, 'DevPipeline', {
      pipelineName: name,
      crossAccountKeys: false,
    });
    this.tagResource(pipeline);
    return pipeline;
  }

  private tagResource(scope: cdk.Construct): void {
    // ref: https://github.com/aws/aws-cdk/issues/4134
    Tags.of(scope).add('CDK-CfnStackId', Aws.STACK_ID);
    Tags.of(scope).add('CDK-CfnStackName', Aws.STACK_NAME);
  }

  private createCodeBuildEventLambdaFunction(
    stage: string,
    slackWebhookURL: string
  ): lambda.Function {
    const lambdaFunc = new lambda.Function(this, 'CodeBuildEventLambda', {
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../lambda/codebuild-event'),
        {
          bundling: {
            user: 'root',
            image: lambda.Runtime.NODEJS_14_X.bundlingImage,
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
