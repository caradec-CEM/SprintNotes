/**
 * Thin wrapper for calling Claude API through the Vite dev proxy.
 * Used only for generating prose text for demo deck slides.
 */

const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 1024;
const TEMPERATURE = 0.3;

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ClaudeResponse {
  content: Array<{ type: string; text: string }>;
}

export async function generateText(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  try {
    const messages: ClaudeMessage[] = [
      { role: 'user', content: userPrompt },
    ];

    const res = await fetch('/anthropic-api/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        system: systemPrompt,
        messages,
      }),
    });

    if (!res.ok) {
      console.warn(`Claude API error: ${res.status} ${res.statusText}`);
      return '';
    }

    const data: ClaudeResponse = await res.json();
    const textBlock = data.content?.find((b) => b.type === 'text');
    return textBlock?.text?.trim() ?? '';
  } catch (err) {
    console.warn('Claude API unavailable:', err);
    return '';
  }
}
