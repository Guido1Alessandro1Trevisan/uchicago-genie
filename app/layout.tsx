import type { Metadata } from "next";
import localFont from "next/font/local";
import { Analytics } from "@vercel/analytics/react"
import { SessionProvider } from "next-auth/react";


import "./globals.css";

const adobeGaramond = localFont({
  src: [
    {
      path: '../public/fonts/AGaramondPro-Regular.woff',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../public/fonts/AGaramondPro-Bold.woff',
      weight: '700',
      style: 'normal',
    },
  ],
  variable: '--font-adobe-garamond',
});

export const metadata: Metadata = {
  title: "UChicago Genie - University of Chicago Course Catalogue",
  description: "UChicago Genie is your personal companion ready to answer any questions about professor and course feedback, core curriculum, majors, degree paths, course requirements, content, and schedules with no hallucinations—at most, it may be unhelpful.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <Analytics/>
      <body className={`${adobeGaramond.variable} font-serif`}>
        <SessionProvider>
          {children}
        </SessionProvider>
        <Analytics/>
      </body>
    </html>
  );
}