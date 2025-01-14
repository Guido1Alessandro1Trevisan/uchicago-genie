"use server"

import { getXataClient } from '@/src/xata';

export default async function fetchThreads(email: string) {
  const xata = getXataClient();
  const user = await xata.db.users.filter({ email }).getFirst();

  if (user) {
    const { records } = await xata.db.threads
      .filter({ userid: user.id })
      .getPaginated({
        pagination: {
          size: 100 
        }
      });

    return records.map((thread) => ({ 
      id: thread.id, 
      name: thread.name 
    }));
  }

  return [];
}