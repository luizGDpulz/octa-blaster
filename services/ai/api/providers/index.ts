import type { AiProvider, AiProviderConfig } from '@/types/ai';
import type { ProviderPayload } from './contracts';
import type { HttpOptions } from '../transport';
import { generateOpenAi } from './openai';
import { generateGemini } from './gemini';
import { generateClaude } from './claude';
import { generateCompatible } from './compatible';
export function generateProvider(provider: AiProvider, config: AiProviderConfig, payload: ProviderPayload, options: HttpOptions) {
  if (provider === 'openai') return generateOpenAi(config, payload, options);
  if (provider === 'gemini') return generateGemini(config, payload, options);
  if (provider === 'claude') return generateClaude(config, payload, options);
  return generateCompatible(provider, config, payload, options);
}
