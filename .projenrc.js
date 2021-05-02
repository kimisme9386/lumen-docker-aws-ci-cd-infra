const { AwsCdkTypeScriptApp } = require('projen');
const project = new AwsCdkTypeScriptApp({
  cdkVersion: '1.101.0',
  cdkVersionPinning: true,
  defaultReleaseBranch: 'main',
  name: 'lumen-docker-aws-ci-cd-infra',
  description:
    'AWS CodePipeline with CodeBuild Infra for lumen-docker-quick-start repo',
  repository: 'https://github.com/kimisme9386/lumen-docker-aws-ci-cd-infra',
  dependabot: false,
  cdkDependencies: [
    '@aws-cdk/core',
    '@aws-cdk/aws-codepipeline',
    '@aws-cdk/aws-codepipeline-actions',
    '@aws-cdk/aws-ecr',
    '@aws-cdk/aws-events-targets',
    '@aws-cdk/aws-iam',
    '@aws-cdk/aws-lambda',
    '@aws-cdk/aws-events-targets',
    '@aws-cdk/aws-s3',
    '@aws-cdk/aws-ssm',
    '@aws-cdk/aws-codebuild',
    '@aws-cdk/aws-secretsmanager',
  ],
  deps: ['cdk-pipeline-status'],
});

project.eslint.addRules({
  'comma-dangle': [
    'error',
    {
      arrays: 'always-multiline',
      objects: 'always-multiline',
      imports: 'always-multiline',
      exports: 'always-multiline',
      functions: 'never',
    },
  ],
});

const common_exclude = [
  'cdk.out',
  'cdk.context.json',
  'images',
  'yarn-error.log',
  'dependabot.yml',
];

project.npmignore.exclude(...common_exclude);
project.gitignore.exclude(...common_exclude);

const deployWorkflow = project.github.addWorkflow('Deploy');
deployWorkflow.on({
  push: {
    branches: ['main'],
  },
});

deployWorkflow.addJobs({
  aws_cdk: {
    'runs-on': 'ubuntu-latest',
    steps: [
      {
        name: 'checkout',
        uses: 'actions/checkout@v2',
      },
      {
        name: 'install',
        run: 'sudo npm i -g aws-cdk@' + project.cdkVersion,
      },
      {
        name: 'build',
        run: 'npm run build',
      },
      {
        name: 'deploy',
        run: 'cdk deploy --require-approval never',
      },
    ],
    env: {
      AWS_DEFAULT_REGION: 'ap-northeast-1',
      CDK_DEFAULT_REGION: 'ap-northeast-1',
      AWS_ACCESS_KEY_ID: '${{ secrets.AWS_ACCESS_KEY_ID }}',
      AWS_SECRET_ACCESS_KEY: '${{ secrets.AWS_SECRET_ACCESS_KEY }}',
    },
  },
});

project.synth();
