
import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { XataClient } from "./src/xata"


const xata = new XataClient({ apiKey: process.env.XATA_API_KEY })

export const { handlers, signIn, signOut, auth } = NextAuth({

    providers: [Google],
    callbacks: {
        async signIn({ user }) {

            const email = user.email
            const existingUser = await xata.db.users.filter({ email }).getFirst();

            if (!existingUser) {
                await xata.db.users.create({
                    id: user.id,
                    name: user.name,
                    email: email,
                })
            }

            return true
        }
    }
});