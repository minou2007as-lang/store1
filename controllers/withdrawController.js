const { supabase } = require('../config/supabase');
const { sendToAdmin, escapeHtml } = require('../utils/telegram');

async function withdrawController(req, res) {
  try {
    const { userId, amount, walletAddress, network } = req.body;

    if (!userId || !amount || !walletAddress || !network) {
      return res.status(400).json({
        success: false,
        message: 'userId, amount, walletAddress, and network are required.',
      });
    }

    const { data, error } = await supabase
      .from('withdrawal_requests')
      .insert({
        user_id: userId,
        amount,
        wallet_address: walletAddress,
        network,
        status: 'pending',
      })
      .select('id, user_id, amount, wallet_address, network, status')
      .single();

    if (error) {
      throw new Error(`Supabase insert failed: ${error.message}`);
    }

    const message = [
      '<b>New Withdraw Request</b>',
      `Withdraw ID: <code>${escapeHtml(data.id)}</code>`,
      `User ID: <code>${escapeHtml(data.user_id)}</code>`,
      `Amount: <b>${escapeHtml(data.amount)}</b>`,
      `Network: ${escapeHtml(data.network)}`,
      `Wallet: <code>${escapeHtml(data.wallet_address)}</code>`,
      `Status: <b>${escapeHtml(data.status.toUpperCase())}</b>`,
    ].join('\n');

    await sendToAdmin(message);

    return res.status(201).json({
      success: true,
      message: 'Withdraw request created and admin notified.',
      data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to create withdraw request.',
      error: error.message,
    });
  }
}

module.exports = {
  withdrawController,
};
