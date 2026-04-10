const express = require('express');
const { handleTelegramWebhook } = require('../controllers/telegramWebhookController');
const { sendToAdmin, telegramRequest } = require('../utils/telegram');

const router = express.Router();

router.post('/telegram/webhook', handleTelegramWebhook);

router.get('/telegram/test', async (req, res) => {
  try {
    await sendToAdmin('<b>Telegram Test</b>\nMOHSTORE Telegram integration is working.');

    return res.status(200).json({
      success: true,
      message: 'Test message sent to TELEGRAM_ADMIN_CHAT_ID.',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to send test message.',
      error: error.message,
    });
  }
});

router.post('/telegram/set-webhook', async (req, res) => {
  try {
    const { webhookUrl } = req.body;

    if (!webhookUrl) {
      return res.status(400).json({
        success: false,
        message: 'webhookUrl is required.',
      });
    }

    const result = await telegramRequest('setWebhook', { url: webhookUrl });

    return res.status(200).json({
      success: true,
      message: 'Webhook configured successfully.',
      data: result,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to configure webhook.',
      error: error.message,
    });
  }
});

router.get('/telegram/webhook-info', async (req, res) => {
  try {
    const result = await telegramRequest('getWebhookInfo', {});

    return res.status(200).json({
      success: true,
      message: 'Webhook info fetched successfully.',
      data: result,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch webhook info.',
      error: error.message,
    });
  }
});

module.exports = router;
