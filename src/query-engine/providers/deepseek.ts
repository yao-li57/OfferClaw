import { OpenAIProvider } from './openai.js';

export class DeepSeekProvider extends OpenAIProvider {
  constructor(apiKey?: string) {
    super({
      apiKey: apiKey ?? process.env.DEEPSEEK_API_KEY,
      baseURL: 'https://api.deepseek.com',
      name: 'deepseek',
    });
  }
}
