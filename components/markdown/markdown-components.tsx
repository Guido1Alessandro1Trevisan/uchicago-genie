
// ShowMore.tsx

import React, { useState, useRef, useEffect } from 'react';
import ChildMarkdown from './child-markdown'; // Ensure this path is correct
import { ChevronDown, ChevronUp } from 'lucide-react';
import TurndownService from 'turndown';
import { renderToString } from 'react-dom/server';
import { Button } from '@/components/ui/button';
import { BarChart } from '@mui/x-charts/BarChart';

const turndownService = new TurndownService();

interface ShowMoreProps {
  children: React.ReactNode;
  isLoading?: boolean; 
}

interface CallToActionProps {
  children: React.ReactNode;
  onAction?: (actionText: string) => void;
}

interface HorizontalBarChartProps {
  data: number[];
  labels: string[];
  max?: number;
  isLoading?: boolean;
}

const HorizontalBarChart: React.FC<HorizontalBarChartProps> = ({
  data,
  labels,
  max,
  isLoading,
}) => {
  const barColors = [
    '#EF4444', 
    '#3B82F6', 
    '#10B981', 
    '#F59E0B', 
    '#6366F1', 
    '#8B5CF6', 
    '#EC4899', 
    '#F97316', 
  ];

  const computedMax = max || Math.max(...data);

  const total = data.reduce((sum, value) => sum + value, 0);
  const average = total / data.length;

  const [leftMargin, setLeftMargin] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 768 ? 0 : 180;
    } else {
      return 180; 
    }
  });

  useEffect(() => {
    const handleResize = () => {
      if (typeof window !== 'undefined') {
        if (window.innerWidth < 768) {
          setLeftMargin(0); 
        } else {
          setLeftMargin(180); 
        }
      }
    };

    window.addEventListener('resize', handleResize);

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const chartWidth = 600;
  const rightMargin = 40;
  const barHeight = 30;
  const barGap = 20;
  const bottomMargin = 30;
  const totalHeight =
    labels.length * (barHeight + barGap) - barGap + bottomMargin;

  return (
    <div className="relative font-adobe-garamond px-4 overflow-x-auto mb-0 sm md:w-[400px] lg:w-[600px] mt-2">
      {isLoading ? (
        <div className="mt-5 mb-12">
          {labels.map((label, index) => (
            <div
              key={index}
              className={`flex items-center ${
                index < labels.length - 1 ? 'mb-5' : ''
              }`}
            >
              <div className="w-[160px] pr-2">
                <div className="h-5 bg-gray-200 rounded w-full animate-pulse" />
              </div>
              <div className="flex-grow h-8 bg-gray-200 rounded animate-pulse" />
            </div>
          ))}
        </div>
      ) : (
        <div className="chart-wrapper w-full overflow-x-auto mb-2 relative">
          <svg
            className="chart-svg w-full"
            viewBox={`0 0 ${chartWidth} ${totalHeight}`}
            preserveAspectRatio="xMinYMin meet"
          >
            <defs>
              {data.map((_, index) => (
                <linearGradient
                  key={index}
                  id={`barGradient${index}`}
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="0%"
                >
                  <stop
                    offset="0%"
                    stopColor={barColors[index % barColors.length]}
                  />
                  <stop
                    offset="100%"
                    stopColor={barColors[index % barColors.length]}
                  />
                </linearGradient>
              ))}
            </defs>

            <g className="grid">
              {Array.from({ length: 5 }, (_, i) => (i / 4) * computedMax).map(
                (value, i) => {
                  const x =
                    leftMargin +
                    ((value / computedMax) *
                      (chartWidth - leftMargin - rightMargin));
                  return (
                    <g key={i}>
                      <line
                        x1={x}
                        y1={0}
                        x2={x}
                        y2={totalHeight - bottomMargin}
                        stroke="#e0e0e0"
                        strokeWidth={1}
                      />
                      <text
                        x={x}
                        y={totalHeight - 10}
                        textAnchor="middle"
                        fontSize={12}
                        fill="#666"
                        className="font-sans"
                      >
                        {Math.round(value)}
                      </text>
                    </g>
                  );
                }
              )}
            </g>

            {data.map((value, index) => {
              const y = index * (barHeight + barGap);
              const barWidth =
                (value / computedMax) * (chartWidth - leftMargin - rightMargin);
              return (
                <g key={index}>
                  <text
                    x={leftMargin - 10}
                    y={y + barHeight / 2}
                    textAnchor="end"
                    alignmentBaseline="middle"
                    fontSize={14}
                    fill="#333"
                    className="font-sans hidden md:block"
                  >
                    {labels[index]}
                  </text>
                  <rect
                    x={leftMargin}
                    y={y}
                    width={barWidth}
                    height={barHeight}
                    fill={`url(#barGradient${index})`}
                    rx={4}
                    ry={4}
                  />
                  <text
                    x={leftMargin + barWidth + 5}
                    y={y + barHeight / 2}
                    textAnchor="start"
                    alignmentBaseline="middle"
                    fontSize={12}
                    fill="#333"
                    className="font-sans hidden md:block"
                  >
                    {value}
                  </text>
                  <title>{`${labels[index]}: ${value}`}</title>
                </g>
              );
            })}
          </svg>
          <div className="absolute inset-0 z-10"></div>
        </div>
      )}
      <div className="mt-4 md:hidden">
        {data.map((value, index) => (
          <div key={index} className="legend-item flex items-center mb-2">
            <span
              className="legend-color-box w-4 h-4 mr-2 rounded-sm flex-shrink-0"
              style={{
                backgroundColor: barColors[index % barColors.length],
              }}
            ></span>
            <span className="legend-label font-bold mr-1">
              {labels[index]}:
            </span>
            <span className="legend-value">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

interface HorizontalBarChartProps {
  data: number[];
  labels: string[];
  max?: number;
  isLoading?: boolean;
  width?: number;
  leftMargin?: number;
}


const ShowMore: React.FC<ShowMoreProps> = ({ children, isLoading }) => {
  const [isExpanded, setIsExpanded] = useState(isLoading || false); 

  const htmlString = renderToString(children);
  const extractedText = turndownService.turndown(htmlString);

  const maxChars = 200; 
  const isLongContent = extractedText.length > maxChars;

  const displayContent = isExpanded ? (
    <ChildMarkdown text={extractedText} />
  ) : (
    <ChildMarkdown text={extractedText.substring(0, maxChars) + (isLongContent ? '...' : '')} />
  );

  return (
    <div className="relative rounded-lg p-4 bg-gray-50">
      <div className="relative">
        {displayContent}
        {!isExpanded && isLongContent && (
          <div className="absolute bottom-0 left-0 w-full h-8 bg-gradient-to-t from-gray-50 to-transparent" />
        )}
      </div>

      {isLongContent && (
        <button
          className="mt-2 p-2 rounded-full hover:bg-gray-200 transition-colors duration-200 focus:outline-none flex flex-row items-center justify-center"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-label={isExpanded ? 'Show less' : 'Show more'}
        >
          {isExpanded ? 'Show less' : 'Show more'}
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-gray-500 mt-[1px]" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-500 mt-[1px]" />
          )}
        </button>
      )}
    </div>
  );
};

const LongShowMore: React.FC<ShowMoreProps> = ({ children, isLoading }) => {
  const [isExpanded, setIsExpanded] = useState(isLoading || false); 

  const htmlString = renderToString(children);
  const extractedText = turndownService.turndown(htmlString);

  const maxChars = 1000; 
  const isLongContent = extractedText.length > maxChars;

  const displayContent = isExpanded ? (
    <ChildMarkdown text={extractedText} />
  ) : (
    <ChildMarkdown text={extractedText.substring(0, maxChars) + (isLongContent ? '...' : '')} />
  );

  return (
    <div className="relative rounded-lg p-4 bg-gray-50">
      <div className="relative">
        {displayContent}
        {!isExpanded && isLongContent && (
          <div className="absolute bottom-0 left-0 w-full h-8 bg-gradient-to-t from-gray-50 to-transparent" />
        )}
      </div>

      {isLongContent && (
        <button
          className="mt-2 p-2 rounded-full hover:bg-gray-100 transition-colors duration-200 focus:outline-none flex flex-row items-center justify-center w-full bg-gray-200 "
          onClick={() => setIsExpanded(!isExpanded)}
          aria-label={isExpanded ? 'Show less' : 'Show more'}
        >
          {isExpanded ? 'Show less' : 'Show more'}
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-gray-500 mt-[1px]" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-500 mt-[1px]" />
          )}
        </button>
      )}
    </div>
  );
};

const CallToAction: React.FC<CallToActionProps> = ({ children, onAction }) => {
  const htmlString = renderToString(children);
  const extractedText = turndownService.turndown(htmlString);

  const handleClick = () => {
    if (onAction) {
      onAction(extractedText);
    }
  };

  return (
    <Button
      onClick={handleClick}
      className="text-left px-4 py-2 hover:bg-slate-200 bg-transparent h-auto justify-start  bg-slate-100 white-space mt-2  w-full whitespace-pre-line"
      variant="ghost"
    >
      <ChildMarkdown text={extractedText} />
    </Button>
  );
};

const Separator: React.FC = () => {
  return <hr className="my-4 border-t-2 border-gray-300 w-full" />;
};

const SpaceSeparator: React.FC = () => {
  return <hr className="my-4 w-full" />;
};

const Fallback: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const htmlString = renderToString(children);
  const extractedText = turndownService.turndown(htmlString);

  return (
    <span className="text-red-500 font-bold">
      <ChildMarkdown text={extractedText} />
    </span>
  );
};

export {
  ShowMore,
  LongShowMore,
  CallToAction,
  Separator,
  SpaceSeparator,
  HorizontalBarChart,
  Fallback,
};