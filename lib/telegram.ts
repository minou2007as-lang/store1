type TelegramInlineKeyboardButton = {
  text: string
  callback_data: string
}

type TelegramReplyMarkup = {
  inline_keyboard: TelegramInlineKeyboardButton[][]
}

type SendOrderNotificationInput = {
  orderId: string
  gameName: string
  offerName: string
  price: number
  customerUsername: string
  visibility: 'public' | 'private'
}

type SellerTelegramTarget = {
  telegramId: string | null | undefined
}

function escapeMarkdown(value: string) {
  return value.replace(/([_\*\[\]\(\)~`>#+\-=|{}.!])/g, '\\$1')
}

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  keyboard?: TelegramReplyMarkup
) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN is missing')
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true,
      ...(keyboard ? { reply_markup: keyboard } : {}),
    }),
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.ok) {
    throw new Error(`Telegram sendMessage failed: ${response.status} ${JSON.stringify(payload)}`)
  }

  return payload.result
}

export async function sendOrderNotification(
  order: SendOrderNotificationInput,
  sellerTarget: SellerTelegramTarget
) {
  const groupChatId = process.env.TELEGRAM_GROUP_CHAT_ID

  const targetChatId =
    order.visibility === 'public'
      ? groupChatId
      : sellerTarget.telegramId

  if (!targetChatId) {
    return {
      sent: false,
      reason:
        order.visibility === 'public'
          ? 'TELEGRAM_GROUP_CHAT_ID is missing'
          : 'Seller has no linked Telegram account',
    }
  }

  const message = [
    order.visibility === 'public' ? '*🔥 NEW ORDER \(PUBLIC\)*' : '*🔥 NEW ORDER*',
    '',
    `🎮 *Game:* ${escapeMarkdown(order.gameName)}`,
    `📦 *Offer:* ${escapeMarkdown(order.offerName)}`,
    `💰 *Price:* ${order.price} points`,
    `👤 *User:* ${escapeMarkdown(order.customerUsername)}`,
    '',
    `🆔 *Order:* #${escapeMarkdown(order.orderId)}`,
  ].join('\n')

  await sendTelegramMessage(targetChatId, message, {
    inline_keyboard: [
      [
        { text: '✅ Accept', callback_data: `order_accept:${order.orderId}` },
        { text: '❌ Reject', callback_data: `order_reject:${order.orderId}` },
      ],
    ],
  })

  return { sent: true }
}
