"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_codepipeline_1 = require("@aws-sdk/client-codepipeline");
const client_s3_1 = require("@aws-sdk/client-s3");
const axios_1 = __importDefault(require("axios"));
const url_1 = __importDefault(require("url"));
var CodePipelineState;
(function (CodePipelineState) {
    CodePipelineState["STARTED"] = "STARTED";
    CodePipelineState["RESUMED"] = "RESUMED";
    CodePipelineState["CANCELED"] = "CANCELED";
    CodePipelineState["FAILED"] = "FAILED";
    CodePipelineState["SUCCEEDED"] = "SUCCEEDED";
    CodePipelineState["SUPERSEDED"] = "SUPERSEDED";
})(CodePipelineState || (CodePipelineState = {}));
const CodePipelineFailState = [
    CodePipelineState.CANCELED,
    CodePipelineState.FAILED,
    CodePipelineState.SUCCEEDED,
];
exports.handler = (event, 
// eslint-disable-next-line @typescript-eslint/no-unused-vars
context, 
// eslint-disable-next-line @typescript-eslint/no-unused-vars
callback) => __awaiter(void 0, void 0, void 0, function* () {
    console.info('Debug event\n' + JSON.stringify(event, null, 2));
    const state = event.detail.state;
    const subject = `project: ${event.detail.pipeline} \n ${event['detail-type']}: ${state}`;
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    const badgeBucket = process.env.BADGE_BUCKET_NAME;
    const badgeBucketImageKeyName = process.env
        .BADGE_BUCKET_IMAGE_KEY_NAME;
    const passingSvgUrl = 'https://img.shields.io/badge/AWS%20CodePipeline-passing-green.svg';
    const failSvgUrl = 'https://img.shields.io/badge/AWS%20CodePipeline-fail-red.svg';
    const executionId = event.detail['execution-id'];
    const codePipelineName = process.env.CODE_PIPELINE_NAME;
    const githubPersonalToken = process.env.GITHUB_PERSONAL_TOKEN;
    const respData = yield axios_1.default
        .create({
        headers: { 'Context-Type': 'application/json' },
    })
        .post(webhookUrl, { text: `${process.env.STAGE}: ${subject}` });
    console.log(`webhookUrl response:\n ${respData}`);
    let imageUrl = null;
    if (state == CodePipelineState.SUCCEEDED) {
        imageUrl = passingSvgUrl;
    }
    else if (CodePipelineFailState.includes(state)) {
        imageUrl = failSvgUrl;
    }
    console.log(`debug badge update image: ${imageUrl}`);
    if (imageUrl) {
        const imageResp = yield axios_1.default.get(imageUrl, {
            responseType: 'arraybuffer',
        });
        const s3 = new client_s3_1.S3Client({ region: 'ap-northeast-1' });
        yield s3.send(new client_s3_1.PutObjectCommand({
            Bucket: badgeBucket,
            Key: badgeBucketImageKeyName,
            Body: Buffer.from(imageResp.data),
            ContentType: 'image/svg+xml',
            CacheControl: 'cache-control: no-cache',
            Expires: new Date(Date.now()),
        }));
    }
    const sourceActionData = yield getPipelineSourceActionData(executionId, codePipelineName);
    let sourceActionState = null;
    switch (state) {
        case CodePipelineState.STARTED:
        case CodePipelineState.RESUMED:
        case CodePipelineState.SUPERSEDED:
            sourceActionState = 'pending';
            break;
        case CodePipelineState.SUCCEEDED:
            sourceActionState = 'success';
            break;
        case CodePipelineState.CANCELED:
        case CodePipelineState.FAILED:
            sourceActionState = 'error';
            break;
    }
    console.log(`debug state: ${state}`);
    console.log(`debug sourceActionData: ${JSON.stringify(sourceActionData)}`);
    if (sourceActionData && sourceActionState) {
        console.log(`sourceActionCommitStatusUrl:\n https://api.github.com/repos/${sourceActionData === null || sourceActionData === void 0 ? void 0 : sourceActionData.owner}/${sourceActionData === null || sourceActionData === void 0 ? void 0 : sourceActionData.repository}/statuses/${sourceActionData === null || sourceActionData === void 0 ? void 0 : sourceActionData.sha}`);
        const respSourceActionData = yield axios_1.default
            .create({
            headers: {
                'Context-Type': 'application/json',
                Authorization: `token ${githubPersonalToken}`,
            },
        })
            .post(`https://api.github.com/repos/${sourceActionData === null || sourceActionData === void 0 ? void 0 : sourceActionData.owner}/${sourceActionData === null || sourceActionData === void 0 ? void 0 : sourceActionData.repository}/statuses/${sourceActionData === null || sourceActionData === void 0 ? void 0 : sourceActionData.sha}`, {
            state: sourceActionState,
            target_url: `https://ap-northeast-1.console.aws.amazon.com/codesuite/codepipeline/pipelines/${codePipelineName}/view`,
            context: 'continuous-integration/codepipeline',
            description: `Build ${sourceActionState}`,
        });
        console.log(respSourceActionData);
    }
});
const getPipelineSourceActionData = (executionId, pipelineName) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const client = new client_codepipeline_1.CodePipelineClient({
        region: 'ap-northeast-1',
    });
    const result = yield client.send(new client_codepipeline_1.GetPipelineExecutionCommand({
        pipelineExecutionId: executionId,
        pipelineName: pipelineName,
    }));
    console.log(`pipeline data:\n ${JSON.stringify(result)}`);
    const artifactRevision = ((_a = result.pipelineExecution) === null || _a === void 0 ? void 0 : _a.artifactRevisions) ? (_b = result.pipelineExecution) === null || _b === void 0 ? void 0 : _b.artifactRevisions[0] : null;
    if (artifactRevision) {
        const revisionURL = artifactRevision.revisionUrl;
        const sha = artifactRevision.revisionId;
        const fullRepositoryId = new url_1.default.URL(revisionURL).searchParams.get('FullRepositoryId');
        return {
            owner: fullRepositoryId ? fullRepositoryId.split('/')[0] : '',
            repository: fullRepositoryId ? fullRepositoryId.split('/')[1] : '',
            sha: sha ? sha : '',
        };
    }
    return null;
});
//# sourceMappingURL=codepipelineEventLambda.js.map