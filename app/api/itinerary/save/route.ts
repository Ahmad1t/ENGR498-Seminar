import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 500 });
    }

    const body = await request.json();
    const { userId, origin, destination, departureDate, offerId, totalAmount, currency } = body;

    if (!userId || !origin || !destination || !departureDate) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const itinerary = await prisma.itinerary.create({
      data: {
        userId,
        origin,
        destination,
        departureDate: new Date(departureDate),
        offerId,
        totalAmount: parseFloat(totalAmount),
        currency,
      },
    });

    return NextResponse.json(itinerary);
  } catch (error: any) {
    console.error('Prisma Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to save itinerary' }, { status: 500 });
  }
}
