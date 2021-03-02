import { IncomingMessage } from 'http';
import * as https from 'https';
import * as url from 'url';

export const handler = (event: any): void => {
  console.info('Debug event\n' + JSON.stringify(event, null, 2));
  const subject = `project: ${event.detail.pipeline} \n ${event['detail-type']}: ${event.detail.state}`;
  const webhookURL = url.parse(process.env.SLACK_WEBHOOK_URL as string);

  const req = https.request(
    {
      hostname: webhookURL.host,
      port: 443,
      path: webhookURL.path,
      method: 'POST',
      headers: {
        'Context-Type': 'application/json',
      },
    },
    (res: IncomingMessage) => {
      console.log(`STATUS: ${res.statusCode}`);
      res.on('data', (chunk) => {
        console.log(`BODY: ${chunk}`);
      });
    }
  );
  req.write(
    JSON.stringify({
      text: `${process.env.STAGE}: ${subject}`,
    })
  );
  req.end();
};
