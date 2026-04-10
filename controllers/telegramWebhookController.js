const { supabase } = require('../config/supabase');
const {
  answerCallbackQuery,
  editMessageReplyMarkup,
  editMessageText,
  editMessageCaption,
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

function parseTopupAction(callbackData) {
  const match = /^topup_(approve|reject):(.+)$/.exec(callbackData || '');

  if (!match) return null;

  return {
    action: match[1],
    topupId: match[2],
  };
}

async function editCallbackMessageStatus(callbackQuery, statusText) {
  const chatId = callbackQuery.message?.chat?.id;
  const messageId = callbackQuery.message?.message_id;

  if (!chatId || !messageId) return;

  const originalText = callbackQuery.message?.text || callbackQuery.message?.caption || '';
  const nextText = `${statusText}\n\n${originalText}`.slice(0, 4000);

  await editMessageReplyMarkup(chatId, messageId, []);

  if (callbackQuery.message?.photo?.length) {
    await editMessageCaption(chatId, messageId, nextText);
  } else {
    await editMessageText(chatId, messageId, nextText);
  }
}

async function notifyUserTopupResult(userId, status, amountPoints, topupId) {
  const { data: userWithTelegram, error: telegramLookupError } = await supabase
    .from('users')
    .select('telegram_id')
    .eq('id', userId)
    .maybeSingle();

  if (telegramLookupError?.code === '42703') {
    return;
  }

  if (telegramLookupError || !userWithTelegram?.telegram_id) {
    return;
  }

  const text =
    status === 'approved'
      ? [
          '<b>✅ Top-Up Approved</b>',
          `Top-Up ID: <code>${escapeHtml(topupId)}</code>`,
          `Amount Added: <b>${escapeHtml(amountPoints)}</b> points`,
        ].join('\n')
      : [
          '<b>❌ Top-Up Rejected</b>',
          `Top-Up ID: <code>${escapeHtml(topupId)}</code>`,
          'Your request was rejected by admin.',
        ].join('\n');

  await sendMessage(userWithTelegram.telegram_id, text);
}

function isValidTopupId(value) {
  const raw = String(value || '');
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const numericPattern = /^\d+$/;
  return uuidPattern.test(raw) || numericPattern.test(raw);
}

async function handleTelegramWebhook(req, res) {
  let callbackQueryId = null;
  try {
    const update = req.body;

    console.log('[Telegram][Webhook] Incoming update:', JSON.stringify(update));

    if (!update?.callback_query) {
      return res.status(200).json({ success: true, message: 'No callback query in this update.' });
    }

    const callbackQuery = update.callback_query;
    callbackQueryId = callbackQuery?.id || null;
    console.log('[Telegram][Webhook] Callback received:', callbackQuery.data);

    const rawData = String(callbackQuery.data || '');
    if (rawData.startsWith('topup_approve')) {
      console.log('[Telegram][Webhook] Approve clicked:', rawData);
    }
    if (rawData.startsWith('topup_reject')) {
      console.log('[Telegram][Webhook] Reject clicked:', rawData);
    }

    if (process.env.TELEGRAM_CALLBACK_DEBUG_ECHO === 'true') {
      await answerCallbackQuery(callbackQuery.id, 'Button works ✅', false);
      return res.status(200).json({ success: true, message: 'Debug callback echo sent.' });
    }

    const parsed = parseOrderAction(callbackQuery.data);
    const parsedTopup = parseTopupAction(callbackQuery.data);

    if (parsedTopup) {
      const adminTelegramId = String(callbackQuery.from?.id || 'unknown');
      const adminActor = callbackQuery.from?.username
        ? `${callbackQuery.from.username} (${adminTelegramId})`
        : adminTelegramId;

      if (!isValidTopupId(parsedTopup.topupId)) {
        await answerCallbackQuery(callbackQuery.id, 'Invalid top-up ID.', true);
        return res.status(200).json({ success: true, message: 'Invalid top-up ID.' });
      }

      // Current schema uses UUID top-up IDs for RPC input.
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(parsedTopup.topupId))) {
        await answerCallbackQuery(callbackQuery.id, 'Unsupported top-up ID format for this environment.', true);
        return res.status(200).json({ success: true, message: 'Unsupported top-up ID format.' });
      }

      // Fast UX: acknowledge and disable buttons immediately to reduce spam clicks.
      await answerCallbackQuery(callbackQuery.id, '⏳ Processing...', false);
      if (callbackQuery.message?.chat?.id && callbackQuery.message?.message_id) {
        await editMessageReplyMarkup(callbackQuery.message.chat.id, callbackQuery.message.message_id, []);
      }

      const action = parsedTopup.action === 'approve' ? 'approve' : 'reject';

      const { data: rpcResult, error: rpcError } = await supabase.rpc('process_topup_admin_action', {
        p_topup_id: parsedTopup.topupId,
        p_action: action,
        p_admin_telegram_id: adminTelegramId,
      });

      if (rpcError) {
        console.error('[Telegram][TopUp] transactional RPC failed', {
          topupId: parsedTopup.topupId,
          action,
          adminActor,
          error: rpcError.message,
        });

        await editCallbackMessageStatus(callbackQuery, '⚠️ Processing Failed');
        return res.status(200).json({
          success: true,
          message: 'Top-up RPC failed. Ensure migration was applied.',
        });
      }

      const result = rpcResult || {};
      const isSuccess = Boolean(result.success ?? result.ok);
      if (!isSuccess) {
        const code = String(result.code || 'unknown');
        const statusFromResult = result.status ? String(result.status) : null;
        const messageFromResult = result.message ? String(result.message) : null;
        if (code === 'already_processed') {
          const status = String(statusFromResult || 'processed');
          await editCallbackMessageStatus(
            callbackQuery,
            status === 'approved' ? '✅ Approved' : status === 'rejected' ? '❌ Rejected' : `ℹ️ ${status}`
          );
          return res.status(200).json({ success: true, message: messageFromResult || `Top-up already ${status}.` });
        }

        const failLabel = action === 'approve' ? 'Approve Failed' : 'Reject Failed';
        await editCallbackMessageStatus(callbackQuery, `⚠️ ${failLabel}`);
        return res.status(200).json({ success: true, message: messageFromResult || `Top-up ${action} failed: ${code}` });
      }

      const resolvedStatus = String(result.status || (action === 'approve' ? 'approved' : 'rejected'));
      const amountPoints = Number(result.amount_points || 0);
      const topupId = String(result.topup_id || parsedTopup.topupId);
      const userId = String(result.user_id || '');
      const userTelegramId = result.user_telegram_id ? String(result.user_telegram_id) : null;

      try {
        if (userTelegramId) {
          const text =
            resolvedStatus === 'approved'
              ? [
                  '<b>✅ Top-Up Approved</b>',
                  `Top-Up ID: <code>${escapeHtml(topupId)}</code>`,
                  `Amount Added: <b>${escapeHtml(amountPoints)}</b> points`,
                ].join('\n')
              : [
                  '<b>❌ Top-Up Rejected</b>',
                  `Top-Up ID: <code>${escapeHtml(topupId)}</code>`,
                  'Your top-up request was rejected.',
                ].join('\n');

          await sendMessage(userTelegramId, text);
        } else if (userId) {
          await notifyUserTopupResult(userId, resolvedStatus, amountPoints, topupId);
        }
      } catch (notifyError) {
        console.error('[Telegram][TopUp] user notify failed', {
          topupId,
          status: resolvedStatus,
          userId,
          error: notifyError.message,
        });
      }

      await editCallbackMessageStatus(
        callbackQuery,
        resolvedStatus === 'approved' ? '✅ Approved' : '❌ Rejected'
      );

      console.log('[Telegram][TopUp] action processed', {
        topupId,
        status: resolvedStatus,
        amountPoints,
        adminActor,
        processedAt: new Date().toISOString(),
      });

      return res.status(200).json({
        success: true,
        message: `Top-up ${resolvedStatus}.`,
        data: { id: topupId, status: resolvedStatus, points_added: amountPoints },
      });
    }

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
    if (callbackQueryId) {
      try {
        await answerCallbackQuery(callbackQueryId, 'Processing failed. Try again.', true);
      } catch (_callbackError) {
        // Ignore callback answer failures in error path.
      }
    }

    console.error('[Telegram][Webhook] Callback processing failed:', error.message);
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

