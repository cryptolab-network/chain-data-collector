import { IncomingWebhook, IncomingWebhookResult } from "@slack/webhook";

class SlackBot {
  url: string
  webhook: IncomingWebhook
  constructor(url: string) {
    this.url = url;
    this.webhook = new IncomingWebhook(url);
  }

  async send(message: string): Promise<IncomingWebhookResult> {
    return await this.webhook.send(message);
  }
}

export default SlackBot;