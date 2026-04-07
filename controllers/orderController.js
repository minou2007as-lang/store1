const { supabase } = require('../config/supabase');
const { sendToGroup, escapeHtml } = require('../utils/telegram');

async function createOrderController(req, res) {
  try {
    const { customerId, offerId, pointsAmount } = req.body;

    if (!customerId || !offerId || !pointsAmount) {
      return res.status(400).json({
        success: false,
        message: 'customerId, offerId, and pointsAmount are required.',
      });
    }

    const { data, error } = await supabase
      .from('orders')
      .insert({
        customer_id: customerId,
        offer_id: offerId,
        points_amount: pointsAmount,
        status: 'pending',
      })
      .select('id, customer_id, offer_id, points_amount, status, created_at')
      .single();

    if (error) {
      throw new Error(`Supabase insert failed: ${error.message}`);
    }

    const text = [
      '<b>New Order Created</b>',
      `Order ID: <code>${escapeHtml(data.id)}</code>`,
      `Customer ID: <code>${escapeHtml(data.customer_id)}</code>`,
      `Offer ID: <code>${escapeHtml(data.offer_id)}</code>`,
      `Amount: <b>${escapeHtml(data.points_amount)}</b> points`,
      `Status: <b>${escapeHtml(data.status.toUpperCase())}</b>`,
    ].join('\n');

    await sendToGroup(text, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'Accept Order', callback_data: `order_accept:${data.id}` },
            { text: 'Reject Order', callback_data: `order_reject:${data.id}` },
          ],
        ],
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Order created and group notified.',
      data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to create order.',
      error: error.message,
    });
  }
}

module.exports = {
  createOrderController,
};
