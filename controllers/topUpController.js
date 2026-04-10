const { supabase } = require('../config/supabase');
const { sendToAdmin, sendPhotoToAdmin, escapeHtml } = require('../utils/telegram');

const RETRY_DELAY_MS = 500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function classifyTelegramError(error) {
  const message = error?.message || String(error);
  const lower = message.toLowerCase();
  const retryable =
    lower.includes('timeout') ||
    lower.includes('network') ||
    lower.includes('econnreset') ||
    lower.includes('429') ||
    lower.includes('502') ||
    lower.includes('503') ||
    lower.includes('504');

  return { retryable, message };
}

async function notifyAdminNonBlocking({ receipt, message, inlineKeyboard }) {
  const sendOnce = async () => {
    if (receipt) {
      try {
        await sendPhotoToAdmin(receipt, {
          caption: message,
          reply_markup: inlineKeyboard,
        });
        return;
      } catch (_photoError) {
        // Fallback to text message if photo cannot be sent.
      }
    }

    await sendToAdmin(message, {
      reply_markup: inlineKeyboard,
    });
  };

  try {
    await sendOnce();
  } catch (firstError) {
    const first = classifyTelegramError(firstError);
    if (first.retryable) {
      await sleep(RETRY_DELAY_MS + Math.floor(Math.random() * 250));
      try {
        await sendOnce();
        return;
      } catch (retryError) {
        const second = classifyTelegramError(retryError);
        console.warn('[TopUp] Telegram send failed after retry:', second.message);
        return;
      }
    }

    console.warn('[TopUp] Telegram send failed:', first.message);
  }
}

async function topUpController(req, res) {
  try {
    const { userId, amount, paymentMethod, txHash, receiptImage, receiptUrl } = req.body;

    if (!userId || !amount || !paymentMethod) {
      return res.status(400).json({
        success: false,
        message: 'userId, amount, and paymentMethod are required.',
      });
    }

    const { data, error } = await supabase
      .from('point_topups')
      .insert({
        user_id: userId,
        amount_points: amount,
        payment_method: paymentMethod,
        transaction_reference: txHash || null,
        status: 'pending',
      })
      .select('id, user_id, amount_points, payment_method, transaction_reference, status')
      .single();

    if (error) {
      throw new Error(`Supabase insert failed: ${error.message}`);
    }

    // Try to resolve username for better admin visibility.
    let username = null;
    const { data: userRow, error: userError } = await supabase
      .from('users')
      .select('username')
      .eq('id', userId)
      .maybeSingle();

    if (!userError && userRow) {
      username = userRow.username || null;
    }

    const receipt = receiptImage || receiptUrl || null;

    const message = [
      '<b>New Top-Up Request</b>',
      `Username: <b>${escapeHtml(username || 'Unknown')}</b>`,
      `Top-Up ID: <code>${escapeHtml(data.id)}</code>`,
      `User ID: <code>${escapeHtml(data.user_id)}</code>`,
      `Amount: <b>${escapeHtml(data.amount_points)}</b>`,
      `Method: ${escapeHtml(data.payment_method)}`,
      data.transaction_reference ? `Tx Ref: <code>${escapeHtml(data.transaction_reference)}</code>` : null,
      receipt ? `Receipt: ${escapeHtml(receipt)}` : null,
      `Status: <b>${escapeHtml(data.status.toUpperCase())}</b>`,
    ]
      .filter(Boolean)
      .join('\n');

    const inlineKeyboard = {
      inline_keyboard: [
        [
          { text: '✅ Approve', callback_data: `topup_approve:${data.id}` },
          { text: '❌ Reject', callback_data: `topup_reject:${data.id}` },
        ],
      ],
    };

    // Fire-and-forget external notification so user flow is never blocked.
    void notifyAdminNonBlocking({ receipt, message, inlineKeyboard });

    return res.status(201).json({
      success: true,
      message: 'Top-up request created and admin notified.',
      data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to create top-up request.',
      error: error.message,
    });
  }
}

module.exports = {
  topUpController,
};
