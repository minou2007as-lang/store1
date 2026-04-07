const { supabase } = require('../config/supabase');
const { sendToAdmin, escapeHtml } = require('../utils/telegram');

async function topUpController(req, res) {
  try {
    const { userId, amount, paymentMethod, txHash } = req.body;

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

    const message = [
      '<b>New Top-Up Request</b>',
      `Top-Up ID: <code>${escapeHtml(data.id)}</code>`,
      `User ID: <code>${escapeHtml(data.user_id)}</code>`,
      `Amount: <b>${escapeHtml(data.amount_points)}</b>`,
      `Method: ${escapeHtml(data.payment_method)}`,
      data.transaction_reference ? `Tx Ref: <code>${escapeHtml(data.transaction_reference)}</code>` : null,
      `Status: <b>${escapeHtml(data.status.toUpperCase())}</b>`,
    ]
      .filter(Boolean)
      .join('\n');

    await sendToAdmin(message);

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
