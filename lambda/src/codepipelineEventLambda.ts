import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Callback, CodePipelineCloudWatchEvent, Context } from 'aws-lambda';
import { default as axios, default as Axios } from 'axios';

export const handler = async (
  event: CodePipelineCloudWatchEvent,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  context: Context,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  callback: Callback
): Promise<void> => {
  console.info('Debug event\n' + JSON.stringify(event, null, 2));
  const state = event.detail.state;
  const subject = `project: ${event.detail.pipeline} \n ${event['detail-type']}: ${state}`;
  const webhookUrl = process.env.SLACK_WEBHOOK_URL as string;
  const badgeBucket = process.env.BADGE_BUCKET_NAME as string;
  const badgeBucketImageKeyName = process.env
    .BADGE_BUCKET_IMAGE_KEY_NAME as string;
  const passingSvgUrl =
    'https://img.shields.io/badge/AWS%20CodePipeline-passing-green.svg';
  const failSvgUrl =
    'https://img.shields.io/badge/AWS%20CodePipeline-fail-red.svg';

  const respData = await Axios.create({
    headers: { 'Context-Type': 'application/json' },
  }).post(webhookUrl, { text: `${process.env.STAGE}: ${subject}` });
  console.log(`STATUS: ${respData.data.statusCode}`);

  let imageUrl: string | null = null;

  if (state == 'SUCCEEDED') {
    imageUrl = passingSvgUrl;
  } else if (state == 'FAILED') {
    imageUrl = failSvgUrl;
  }

  if (imageUrl) {
    const imageResp = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
    });
    const s3 = new S3Client({ region: 'ap-northeast-1' });
    await s3.send(
      new PutObjectCommand({
        Bucket: badgeBucket,
        Key: badgeBucketImageKeyName,
        Body: Buffer.from(imageResp.data),
        ContentType: 'image/svg+xml',
      })
    );
  }
};
