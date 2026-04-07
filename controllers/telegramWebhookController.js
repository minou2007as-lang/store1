const { supabase } = require('../config/supabase');
const {
  answerCallbackQuery,
  editMessageReplyMarkup,
  sendMessage,
  escapeHtml,
} = require('../utils/telegram');

function parseOrderAction(callbackData) {
  const match = /^order_(accept|reject):(.+)$/.exec(callbackData || '');

  if (!match) return null;

  return {
    action: match[1],
    orderId: match[2],
  };
}

async function handleTelegramWebhook(req, res) {
  try {
    const update = req.body;

    if (!update?.callback_query) {
      return res.status(200).json({ success: true, message: 'No callback query in this update.' });
    }

    const callbackQuery = update.callback_query;
    const parsed = parseOrderAction(callbackQuery.data);

    if (!parsed) {
      await answerCallbackQuery(callbackQuery.id, 'Unsupported action.', false);
      return res.status(200).json({ success: true, message: 'Unsupported callback data.' });
    }

    const newStatus = parsed.action === 'accept' ? 'accepted' : 'rejected';

    const { data: existing, error: fetchError } = await supabase
      .from('orders')
      .select('id, status')
      .eq('id', parsed.orderId)
      .single();

    if (fetchError || !existing) {
      await answerCallbackQuery(callbackQuery.id, 'Order not found.', true);
      return res.status(200).json({ success: true, message: 'Order not found.' });
    }

    if (existing.status !== 'pending') {
      await answerCallbackQuery(callbackQuery.id, `Order already ${existing.status}.`, true);
      return res.status(200).json({ success: true, message: `Order already ${existing.status}.` });
    }

    const { data: updated, error: updateError } = await supabase
      .from('orders')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', parsed.orderId)
      .eq('status', 'pending')
      .select('id, status')
      .single();

    if (updateError || !updated) {
      throw new Error(updateError?.message || 'Failed to update order status.');
    }

    await answerCallbackQuery(callbackQuery.id, `Order ${newStatus}.`, false);

    if (callbackQuery.message?.chat?.id && callbackQuery.message?.message_id) {
      await editMessageReplyMarkup(
        callbackQuery.message.chat.id,
        callbackQuery.message.message_id,
        []
      );

      await sendMessage(
        callbackQuery.message.chat.id,
        [
          '<b>Order Decision Processed</b>',
          `Order ID: <code>${escapeHtml(updated.id)}</code>`,
          `New Status: <b>${escapeHtml(updated.status.toUpperCase())}</b>`,
        ].join('\n')
      );
    }

    return res.status(200).json({
      success: true,
      message: 'Callback processed successfully.',
      data: updated,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to process Telegram callback.',
      error: error.message,
    });
  }
}

module.exports = {
  handleTelegramWebhook,
};
