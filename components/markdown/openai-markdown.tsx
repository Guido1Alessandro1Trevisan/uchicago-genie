
import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import localFont from 'next/font/local';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';

import {
  ShowMore,
  LongShowMore,
  CallToAction,
  Separator,
  SpaceSeparator,
  HorizontalBarChart,
  Fallback,
} from './markdown-components';

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
  onAction?: (actionText: string) => void;
  isLoading?: boolean;
}

const OpenAIMarkdown: React.FC<OpenAIMarkdownProps> = ({ text, onAction, isLoading }) => {
  const components: any = {
    barchart: React.memo(({ node, isLoading }: any) => {
      const { data, labels, max } = useMemo(() => {
        let data: number[] = [];
        let labels: string[] = [];
        let maxValue: number | undefined;
    
        if (node && node.properties) {
          try {
            const chartData = JSON.parse(node.properties.data);
            data = chartData.values;
            labels = chartData.labels;
            maxValue = chartData.max;
          } catch (e) {
            console.error('Invalid data in barchart:', e);
          }
        }
    
        return { data, labels, max: maxValue };
      }, [node]);
    
      if (!data.length || !labels.length) {
        return null;
      }
    
      return (
        <HorizontalBarChart
          isLoading={isLoading}
          data={data}
          labels={labels}
          max={max}
        />
      );
    }),

    h1: ({ node, ...props }: { node: any }) => (
      <h1 className="text-2xl font-bold mb-2" {...props} />
    ),
    h2: ({ node, ...props }: { node: any }) => (
      <h2 className="text-xl font-semibold mt-2" {...props} />
    ),
    h3: ({ node, ...props }: { node: any }) => (
      <h3 className="text-md font-semibold" {...props} />
    ),
    p: ({ node, ...props }: { node: any }) => (
      <p className="whitespace-pre-wrap mt-2" {...props} />
    ),
    a: ({ node, ...props }: { node: any }) => (
      <a className="text-blue-600 hover:text-blue-800 underline" {...props} />
    ),
    ul: ({ node, ordered, ...props }: { node: any; ordered: boolean }) => (
      <ul className="list-disc pl-6 mb-[0px] flex flex-col mt-2 gap-2" {...props} />
    ),
    ol: ({ node, ordered, ...props }: { node: any; ordered: boolean }) => (
      <ol className="list-decimal pl-6 mb-[0px] flex flex-col mt-2 gap-2" {...props} />
    ),
    li: ({ node, ...props }: { node: any }) => (
      <li className="whitespace-normal" {...props} />
    ),
    pre: ({ node, ...props }: { node: any }) => (
      <pre className="bg-gray-100 p-2 rounded mb-2 overflow-x-auto" {...props} />
    ),
    code: ({
      node,
      inline,
      className,
      ...props
    }: {
      node: any;
      inline: any;
      className: string;
    }) =>
      inline ? (
        <code className="bg-gray-100 rounded px-1 py-0.5" {...props} />
      ) : (
        <code className={`block bg-gray-100 p-2 rounded ${className}`} {...props} />
      ),
    blockquote: ({ node, ...props }: { node: any }) => (
      <blockquote className="pl-4 italic mb-4" {...props} />
    ),
    strong: ({ node, ...props }: { node: any }) => (
      <strong className="font-semibold" {...props} />
    ),
    showmore: ({ node, children, ...props }: { node: any; children: React.ReactNode }) => (
      <ShowMore isLoading={isLoading}>{children}</ShowMore>
    ),
    longshowmore: ({ node, children, ...props }: { node: any; children: React.ReactNode }) => (
      <LongShowMore isLoading={isLoading}>{children}</LongShowMore>
    ),
    calltoaction: ({ node, children, ...props }: { node: any; children: React.ReactNode }) => (
      <CallToAction onAction={onAction}>{children}</CallToAction>
    ),
    separator: () => <Separator />,
    spaceseparator: () => <SpaceSeparator />,
    fallback: ({ node, children, ...props }: { node: any; children: React.ReactNode }) => (
      <Fallback>{children}</Fallback>
    ),
  };

  const schema = {
    ...defaultSchema,
    tagNames: [
      ...(defaultSchema.tagNames || []),
      'showmore',
      'longshowmore',
      'calltoaction',
      'separator',
      'fallback',
      'spaceseparator',
      'barchart',
    ],
    attributes: {
      ...defaultSchema.attributes,
      barchart: ['data'],
    },
  };

  return (
    <div
      className={`prose lg:prose-xl ${adobeGaramond.variable} font-serif flex flex-col items-start`}
    >
      <ReactMarkdown
        components={components}
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, schema]]}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
};

export default OpenAIMarkdown;