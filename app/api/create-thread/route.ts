import { NextRequest, NextResponse } from 'next/server';
import { getXataClient } from '@/src/xata';
import { auth } from '@/auth'; // Adjust the path based on your authentication setup

const xata = getXataClient();

export async function POST(req: NextRequest) {
  const session = await auth().catch(() => null);

  try {
    const { name } = await req.json(); // Extract name from request body

    const MAX_NAME_LENGTH = 100; // Limit the name length
    const threadName = name
      ? name.substring(0, MAX_NAME_LENGTH)
      : `Chat ${new Date().toLocaleString()}`;

    let userid = null;

    if (session?.user?.email) {
      // Get user ID
      const user = await xata.db.users
        .filter({ email: session.user.email })
        .getFirst();

      if (user) {
        userid = user.id;
      } else {
        console.warn('User not found in Xata, proceeding without user ID');
      }
    }

    // Create the new thread in Xata
    const xataThread = await xata.db.threads.create({
      userid: userid,
      name: threadName,
    });

    return NextResponse.json(xataThread);
  } catch (error) {
    console.error('Error creating thread:', error);
    return NextResponse.json(
      { error: 'Failed to create thread' },
      { status: 500 }
    );
  }
}
