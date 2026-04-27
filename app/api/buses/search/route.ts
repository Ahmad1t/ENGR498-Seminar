import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { origin, destination, departureDate, maxBudget } = await req.json();

    if (!origin || !destination) {
      return NextResponse.json({ error: 'Origin and destination are required' }, { status: 400 });
    }

    // Realistic bus offer generator
    const busOperators = ['FlixBus', 'Greyhound', 'National Express', 'Megabus', 'Eurolines'];
    const offers = [];

    for (let i = 0; i < 5; i++) {
      const price = Math.floor(Math.random() * 150) + 20;
      if (maxBudget && price > maxBudget) continue;

      const operator = busOperators[Math.floor(Math.random() * busOperators.length)];
      const departureTime = `${Math.floor(Math.random() * 24).toString().padStart(2, '0')}:${Math.floor(Math.random() * 60).toString().padStart(2, '0')}`;
      const arrivalTime = `${Math.floor(Math.random() * 24).toString().padStart(2, '0')}:${Math.floor(Math.random() * 60).toString().padStart(2, '0')}`;

      offers.push({
        id: `bus_${operator}_${i}`,
        type: 'bus',
        operator: operator,
        origin: origin,
        destination: destination,
        departureTime: departureTime,
        arrivalTime: arrivalTime,
        price: price.toString(),
        currency: 'USD',
        duration: `${Math.floor(Math.random() * 10) + 2}h ${Math.floor(Math.random() * 60)}m`,
        amenities: ['WiFi', 'Power Outlets', 'Reclining Seats', 'AC'],
        image: `https://picsum.photos/seed/bus-${operator}/800/600`
      });
    }

    return NextResponse.json({ offers });
  } catch (error: any) {
    console.error('Bus Search Error:', error);
    return NextResponse.json({ error: 'Failed to search buses' }, { status: 500 });
  }
}
