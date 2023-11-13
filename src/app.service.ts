import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import * as TelegramBot from 'node-telegram-bot-api';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppService {
  private readonly openai: OpenAI;
  private readonly telegramBot: TelegramBot; // Adjust the type based on your actual usage

  constructor(private readonly configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get('OPENAI_API_KEY'),
    });

    this.telegramBot = new TelegramBot(
      this.configService.get('TELEGRAM_BOT_TOKEN'),
      {
        polling: true,
      },
    );

    this.setupTelegramBot();
  }

  setupTelegramBot() {
    this.telegramBot.onText(/.*/, async (msg) => {
      const userQuestion = msg.text;
      const assistant = await this.createAssistant();
      const thread = await this.createThread();

      await this.createMessage(thread.id, 'user', userQuestion);
      const run = await this.createRun(thread.id, assistant.id);
      let runStatus = await this.retrieveRunStatus(thread.id, run.id);

      while (runStatus.status !== 'completed') {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        runStatus = await this.retrieveRunStatus(thread.id, run.id);
      }

      const messages = await this.listMessages(thread.id);
      const lastMessageForRun = messages.data
        .filter(
          (message) =>
            message.run_id === run.id && message.role === 'assistant',
        )
        .pop();

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

  async createAssistant(): Promise<any> {
    return this.openai.beta.assistants.create({
      name: 'Holo',
      instructions:
        'You are a customer support chatbot. Use your knowledge base to best respond to customer queries.',
      tools: [{ type: 'retrieval' }],
      model: 'gpt-4-1106-preview',
      file_ids: ['file-OlktVqMJkuD1jsMfqC9wdt52'],
    });
  }

  async createThread(): Promise<any> {
    return this.openai.beta.threads.create();
  }

  async createMessage(
    threadId: string,
    role: string,
    content: string,
  ): Promise<any> {
    return this.openai.beta.threads.messages.create(threadId, {
      role: 'user',
      content,
    });
  }

  async createRun(threadId: string, assistantId: string): Promise<any> {
    return this.openai.beta.threads.runs.create(threadId, {
      assistant_id: assistantId,
    });
  }

  async retrieveRunStatus(threadId: string, runId: string): Promise<any> {
    return this.openai.beta.threads.runs.retrieve(threadId, runId);
  }

  async listMessages(threadId: string): Promise<any> {
    return this.openai.beta.threads.messages.list(threadId);
  }
}
