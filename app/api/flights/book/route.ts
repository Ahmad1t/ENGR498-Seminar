import { NextResponse } from 'next/server';
import { duffel } from '@/lib/duffel';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { offer_id, passengers, payments } = body;

    if (!offer_id || !passengers) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const order = await duffel.orders.create({
      type: 'instant',
      selected_offers: [offer_id],
      passengers: passengers.map((p: any) => ({
        id: p.id, // This ID comes from the offer's passengers
        given_name: p.given_name,
        family_name: p.family_name,
        email: p.email,
        phone_number: p.phone_number,
        born_on: p.born_on,
        gender: p.gender,
        title: p.title,
      })),
      payments: payments || [], // In a real app, you'd handle payment tokens here
    });

    return NextResponse.json(order.data);
  } catch (error: any) {
    console.error('Duffel Booking Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to create booking' }, { status: 500 });
  }
}
