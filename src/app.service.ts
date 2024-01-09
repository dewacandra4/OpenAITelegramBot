import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import * as TelegramBot from 'node-telegram-bot-api';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppService {
  private readonly openai: OpenAI; // use your openai api key from https://platform.openai.com/api-keys
  private readonly telegramBot: TelegramBot; // use your telegram bot token, that you create from @BotFather
  private readonly assistantId: string; // use assistant id that you create from your open ai account

  constructor(private readonly configService: ConfigService) {
    // initialize openai, telegram bot and assistant id
    this.openai = new OpenAI({
      apiKey: this.configService.get('OPENAI_API_KEY'),
    });

    this.telegramBot = new TelegramBot(
      this.configService.get('TELEGRAM_BOT_TOKEN'),
      {
        polling: true,
      },
    );

    this.assistantId = this.configService.get('ASSISTANT_ID');

    this.setupTelegramBot();
  }

  /**
   * Sets up the Telegram bot and handles incoming messages.
   *
   * @param {type} msg - the incoming message from Telegram
   * @return {type} - the response message sent by the bot
   */
  setupTelegramBot() {
    this.telegramBot.onText(/.*/, async (msg) => {
      const userQuestion = msg.text;
      const thread = await this.createThread();
      console.log('user question', userQuestion);

      await this.createMessage(thread.id, userQuestion);
      const run = await this.createRun(thread.id, this.assistantId);
      let runStatus = await this.retrieveRunStatus(thread.id, run.id);

      while (runStatus.status !== 'completed') {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        runStatus = await this.retrieveRunStatus(thread.id, run.id);
      }

      const messages = await this.listMessages(thread.id);
      const lastMessageForRun = messages.data
        .filter(
          (message) =>
            message.run_id === run.id && message.role === 'assistant',
        )
        .pop();
      console.log('last message for run', lastMessageForRun.content);
      if (lastMessageForRun) {
        this.telegramBot.sendMessage(
          msg.chat.id,
          `${lastMessageForRun.content[0].text.value}`,
        );
      } else {
        this.telegramBot.sendMessage(
          msg.chat.id,
          "Sorry, I couldn't generate a response.",
        );
      }
    });
  }

  /**
   * Creates a new thread.
   *
   */
  async createThread(): Promise<any> {
    return this.openai.beta.threads.create();
  }

  async createMessage(threadId: string, content: string): Promise<any> {
    return this.openai.beta.threads.messages.create(threadId, {
      role: 'user',
      content,
    });
  }

  /**
   * Creates a run for a given thread and assistant.
   *
   * @param {string} threadId - The ID of the thread.
   * @param {string} assistantId - The ID of the assistant.
   */
  async createRun(threadId: string, assistantId: string): Promise<any> {
    return this.openai.beta.threads.runs.create(threadId, {
      assistant_id: assistantId,
    });
  }

  /**
   * Retrieves the status of a run given the thread ID and run ID.
   *
   * @param {string} threadId - The ID of the thread.
   * @param {string} runId - The ID of the run.
   */
  async retrieveRunStatus(threadId: string, runId: string): Promise<any> {
    return this.openai.beta.threads.runs.retrieve(threadId, runId);
  }

  async listMessages(threadId: string): Promise<any> {
    return this.openai.beta.threads.messages.list(threadId);
  }
}
