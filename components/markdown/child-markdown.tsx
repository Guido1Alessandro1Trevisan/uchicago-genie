import React from 'react';
import ReactMarkdown from 'react-markdown';
import localFont from 'next/font/local';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';

import { ShowMore } from './markdown-components';

const adobeGaramond = localFont({
  src: [
    {
      path: '../../public/fonts/AGaramondPro-Regular.woff',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../../public/fonts/AGaramondPro-Bold.woff',
      weight: '700',
      style: 'normal',
    },
  ],
  variable: '--font-adobe-garamond',
});

interface OpenAIMarkdownProps {
  text: string;
}


const ChildMarkdown: React.FC<OpenAIMarkdownProps> = ({ text }) => {
  const components: any = {
    h1: ({ node, ...props }: { node: any }) => (
      <h1 className="text-2xl font-bold mb-2" {...props} />
    ),
    h2: ({ node, ...props }: { node: any }) => (
      <h2 className="text-xl font-semibold mb-2 mt-4" {...props} />
    ),
    p: ({ node, ...props }: { node: any }) => (
      <p className="mb-2 whitespace-pre-wrap" {...props} />
    ),
    ul: ({ node, ordered, ...props }: { node: any; ordered: boolean }) => (
      <ul className="list-disc pl-6 mb-[0px] flex flex-col mt-2 gap-2" {...props} />
    ),
    ol: ({ node, ordered, ...props }: { node: any; ordered: boolean }) => (
      <ol className="list-decimal pl-6 mb-[0px] flex flex-col mt-2 gap-2" {...props} />
    ),
    li: ({ node, ...props }: { node: any }) => (
      <li className=" whitespace-normal" {...props} />
    ),
    pre: ({ node, ...props }: { node: any }) => (
      <pre className="bg-gray-100 p-2 rounded mb-2 overflow-x-auto" {...props} />
    ),
    code: ({ node, inline, className, ...props }: { node: any; inline: any; className: string }) =>
      inline ? (
        <code className="bg-gray-100 rounded px-1 py-0.5" {...props} />
      ) : (
        <code className={`block bg-gray-100 p-2 rounded ${className}`} {...props} />
      ),
    blockquote: ({ node, ...props }: { node: any }) => (
      <blockquote className="pl-4 italic mb-4" {...props} />
    ),
    strong: ({ node, ...props }: { node: any }) => <strong className="font-semibold" {...props} />,
  };

  return (
    <div className={`prose lg:prose-xl ${adobeGaramond.variable} font-serif`}>
      <ReactMarkdown
        components={components}
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeSanitize]}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
};

export default ChildMarkdown;
