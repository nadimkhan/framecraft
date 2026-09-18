import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const topicId = parseInt(id, 10);

    if (isNaN(topicId)) {
      return NextResponse.json(
        { error: 'Invalid topic ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { selected } = body;

    const topic = await prisma.topic.update({
      where: { id: topicId },
      data: { selected },
    });

    return NextResponse.json(topic);
  } catch (error) {
    console.error('Error updating topic selection:', error);
    return NextResponse.json(
      { error: 'Failed to update topic selection' },
      { status: 500 }
    );
  }
}
