import axios from 'axios';

/**
 * Send a WhatsApp message via the provider's API.
 * Replace the implementation with your actual provider (Twilio, MessageBird, etc.).
 * @param {string} to - Recipient WhatsApp number (including country code)
 * @param {string} body - Message body
 * @returns {Promise<string>} Resolves with the message ID from the provider
 */
export async function sendWhatsAppMessage(to, body) {
  // Example using a hypothetical HTTP API:
  // const response = await axios.post('https://api.whatsappprovider.com/v1/messages', {
  //   to,
  //   body
  // }, {
  //   headers: {
  //     Authorization: `Bearer ${process.env.WHATSAPP_API_TOKEN}`,
  //     'Content-Type': 'application/json'
  //   }
  // });
  // return response.data.messageId;

  // For now, simulate success with a fake ID.
  console.log('[WhatsAppService] Sending message to', to, ':', body);
  // Simulate random failure for demonstration (remove in production)
  // if (Math.random() < 0.1) {
  //   throw new Error('Failed to send message');
  // }
  return `wamid.${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Send a WhatsApp message with retry logic (exponential backoff).
 * @param {string} to
 * @param {string} body
 * @param {number} maxRetries - Maximum number of attempts (default 3)
 * @returns {Promise<string>} Resolves with the message ID on success
 */
export async function sendWhatsAppMessageWithRetry(to, body, maxRetries = 3) {
  let attempt = 0;
  while (true) {
    try {
      return await sendWhatsAppMessage(to, body);
    } catch (err) {
      attempt++;
      if (attempt > maxRetries) {
        throw err;
      }
      const delay = Math.pow(2, attempt) * 100; // 200ms, 400ms, 800ms, ...
      console.warn(`[WhatsAppService] Attempt ${attempt} failed: ${err.message}. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}