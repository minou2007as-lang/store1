import { NextRequest, NextResponse } from 'next/server';
import { query, executeQuery, queryOne } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { z } from 'zod';

const pickOrderSchema = z.object({
  order_id: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const auth = verifyToken(token);

    if (!auth || auth.role !== 'seller') {
      return NextResponse.json({ error: 'Only sellers can pick orders' }, { status: 403 });
    }

    const body = await request.json();
    const { order_id } = pickOrderSchema.parse(body);

    // Check if seller is assigned to this game and is verified
    const order = await queryOne(
      `SELECT o.*, p.game_id FROM orders o
       JOIN offers of ON o.offer_id = of.id
       JOIN products p ON of.product_id = p.id
       WHERE o.id = ? AND o.status = 'open'`,
      [order_id]
    );

    if (!order) {
      return NextResponse.json({ error: 'Order not found or already picked' }, { status: 404 });
    }

    // Verify seller is assigned to this game
    const sellerGame = await queryOne(
      `SELECT sg.id, s.verification_status FROM seller_games sg
       JOIN sellers s ON sg.seller_id = s.id
       WHERE s.user_id = ? AND sg.game_id = ?`,
      [auth.id, order.game_id]
    );

    if (!sellerGame) {
      return NextResponse.json({ error: 'You are not assigned to this game' }, { status: 403 });
    }

    if (sellerGame.verification_status !== 'verified') {
      return NextResponse.json(
        { error: 'Only verified sellers can pick orders' },
        { status: 403 }
      );
    }

    // ATOMIC UPDATE: Only update if status is still 'open'
    // This ensures only one seller can pick the order
    const result = await executeQuery(
      `UPDATE orders 
       SET assigned_seller_id = ?, status = 'in_progress', picked_at = NOW()
       WHERE id = ? AND status = 'open'`,
      [auth.id, order_id]
    );

    if (result.affectedRows === 0) {
      return NextResponse.json({ error: 'Order was already picked by another seller' }, { status: 409 });
    }

    // Get seller fee percentage
    const seller = await queryOne(
      'SELECT fee_percentage FROM sellers WHERE user_id = ?',
      [auth.id]
    );

    // Calculate seller earnings after fee
    const fee = Math.ceil(order.points_amount * (seller.fee_percentage / 100));
    const seller_earnings = order.points_amount - fee;

    // Update seller earnings and platform fee
    await executeQuery(
      'UPDATE orders SET seller_earnings = ?, platform_fee = ? WHERE id = ?',
      [seller_earnings, fee, order_id]
    );

    return NextResponse.json(
      {
        success: true,
        message: 'Order picked successfully',
        order_id,
        seller_earnings,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Pick order error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
