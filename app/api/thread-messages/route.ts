import { NextResponse } from 'next/server';
import { getXataClient } from '@/src/xata';

const xata = getXataClient();

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const threadId = searchParams.get('threadId');

    console.log(threadId)
  
    if (!threadId) {
      return NextResponse.json({ error: 'Thread ID is required' }, { status: 400 });
    }
  
    try {
      const messages = await xata.db.thread_messages
        .filter({ thread_link: threadId })
        .sort('xata.createdAt' as any, 'asc')
        .getMany();
      

        console.log(messages)
      return NextResponse.json(messages);
    } catch (error) {
      console.error('Error fetching thread messages:', error);
      return NextResponse.json({ error: 'Failed to fetch thread messages' }, { status: 500 });
    }
  }
  
  
