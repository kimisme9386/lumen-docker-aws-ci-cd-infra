"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const https = __importStar(require("https"));
const url = __importStar(require("url"));
exports.handler = (event) => {
    console.info('Debug event\n' + JSON.stringify(event, null, 2));
    const state = event.detail['build-status'];
    const subject = `project: ${event.detail['project-name']} \n ${event['detail-type']}: ${state}`;
    const webhookURL = url.parse(process.env.SLACK_WEBHOOK_URL);
    const req = https.request({
        hostname: webhookURL.host,
        port: 443,
        path: webhookURL.path,
        method: 'POST',
        headers: {
            'Context-Type': 'application/json',
        },
    }, (res) => {
        console.log(`STATUS: ${res.statusCode}`);
        res.on('data', (chunk) => {
            console.log(`BODY: ${chunk}`);
        });
    });
    req.write(JSON.stringify({
        text: `${process.env.STAGE}: ${subject}`,
    }));
    req.end();
};
//# sourceMappingURL=codeBuildEventLambda.js.map