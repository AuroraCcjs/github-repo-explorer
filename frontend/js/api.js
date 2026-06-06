// api.js — API client for communicating with the Cloudflare Worker via SSE

// Update this to your deployed Worker URL after deployment
let WORKER_BASE_URL = 'http://localhost:8787'; // Default for local dev with wrangler dev

/**
 * Set the Worker base URL (call after deployment to update).
 * @param {string} url
 */
export function setWorkerUrl(url) {
  WORKER_BASE_URL = url;
}

/**
 * Get the current Worker base URL.
 * @returns {string}
 */
export function getWorkerUrl() {
  return WORKER_BASE_URL;
}

/**
 * Send a chat message and receive a streaming response via SSE.
 *
 * @param {object} params
 * @param {string} params.repoUrl - GitHub repository URL
 * @param {Array} params.history - Previous messages for context
 * @param {string|null} params.question - User's question (null for initial analysis)
 * @param {function} params.onChunk - Called with each text chunk as it arrives
 * @param {function} params.onDone - Called when streaming completes
 * @param {function} params.onError - Called with an error message
 * @returns {AbortController} — call .abort() to cancel the request
 */
export function sendChatMessage({ repoUrl, history, question, onChunk, onDone, onError }) {
  const controller = new AbortController();

  fetch(`${WORKER_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      repoUrl,
      history: history || [],
      question: question || null,
    }),
    signal: controller.signal,
  }).then(async (response) => {
    // Handle non-200 responses (these are JSON errors, not streams)
    if (!response.ok) {
      let errMsg = `Request failed (${response.status})`;
      try {
        const errData = await response.json();
        errMsg = errData.error || errMsg;
      } catch (e) {
        // Couldn't parse error JSON
      }
      onError(errMsg);
      return;
    }

    // Read the SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process SSE lines: "data: {...}" or "data: [DONE]"
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const data = trimmed.slice(6); // Remove "data: " prefix

        // OpenAI/DeepSeek stream end signal
        if (data === '[DONE]') {
          onDone();
          return;
        }

        try {
          const parsed = JSON.parse(data);

          // OpenAI-compatible SSE format — extract text from choices[0].delta.content
          const delta = parsed.choices?.[0]?.delta;
          if (delta?.content) {
            onChunk(delta.content);
          }
          // finish_reason indicates stream completion
          if (parsed.choices?.[0]?.finish_reason) {
            onDone();
            return;
          }
        } catch (e) {
          // Skip unparseable chunks
        }
      }
    }

    // Stream ended naturally
    onDone();
  }).catch((err) => {
    if (err.name === 'AbortError') return;
    onError(err.message || 'Network error');
  });

  return controller;
}

/**
 * Check if the Worker is reachable.
 * @returns {Promise<boolean>}
 */
export async function checkHealth() {
  try {
    const res = await fetch(`${WORKER_BASE_URL}/api/health`, {
      method: 'GET',
    });
    const data = await res.json();
    return data.status === 'ok';
  } catch (e) {
    return false;
  }
}
