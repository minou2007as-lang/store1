const axios = require('axios');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;
const TELEGRAM_GROUP_CHAT_ID = process.env.TELEGRAM_GROUP_CHAT_ID;

if (!TELEGRAM_BOT_TOKEN) {
  // eslint-disable-next-line no-console
  console.warn('[Telegram] TELEGRAM_BOT_TOKEN is missing in environment variables.');
}

const telegramApi = axios.create({
  baseURL: `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`,
  timeout: 15000,
});

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function validateRequiredEnv(name, value) {
  if (!value) {
    throw new Error(`[Telegram] ${name} is missing in environment variables.`);
  }
}

async function telegramRequest(method, payload) {
  validateRequiredEnv('TELEGRAM_BOT_TOKEN', TELEGRAM_BOT_TOKEN);

  try {
    const response = await telegramApi.post(`/${method}`, payload);

    if (!response.data?.ok) {
      throw new Error(`Telegram API returned non-ok response: ${JSON.stringify(response.data)}`);
    }

    return response.data.result;
  } catch (error) {
    const status = error.response?.status;
    const responseData = error.response?.data;
    const message = error.message || 'Unknown Telegram error';

    throw new Error(
      `[Telegram] ${method} failed${status ? ` (HTTP ${status})` : ''}: ${message}${
        responseData ? ` | response=${JSON.stringify(responseData)}` : ''
      }`
    );
  }
}

async function sendMessage(chatId, message, options = {}) {
  if (!message || typeof message !== 'string') {
    throw new Error('[Telegram] Message must be a non-empty string.');
  }

  if (!chatId) {
    throw new Error('[Telegram] chatId is required to send message.');
  }

  return telegramRequest('sendMessage', {
    chat_id: chatId,
    text: message,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...options,
  });
}

async function sendToAdmin(message, options = {}) {
  validateRequiredEnv('TELEGRAM_ADMIN_CHAT_ID', TELEGRAM_ADMIN_CHAT_ID);
  return sendMessage(TELEGRAM_ADMIN_CHAT_ID, message, options);
}

async function sendToGroup(message, options = {}) {
  validateRequiredEnv('TELEGRAM_GROUP_CHAT_ID', TELEGRAM_GROUP_CHAT_ID);
  return sendMessage(TELEGRAM_GROUP_CHAT_ID, message, options);
}

async function answerCallbackQuery(callbackQueryId, text, showAlert = false) {
  if (!callbackQueryId) {
    throw new Error('[Telegram] callbackQueryId is required.');
  }

  return telegramRequest('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text,
    show_alert: showAlert,
  });
}

async function editMessageReplyMarkup(chatId, messageId, inlineKeyboard = []) {
  return telegramRequest('editMessageReplyMarkup', {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: {
      inline_keyboard: inlineKeyboard,
    },
  });
}

module.exports = {
  escapeHtml,
  telegramRequest,
  sendMessage,
  sendToAdmin,
  sendToGroup,
  answerCallbackQuery,
  editMessageReplyMarkup,
};
