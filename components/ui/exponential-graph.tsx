
"use client";

import React, { useRef, useState, useEffect } from 'react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title as ChartTitle,
    Tooltip,
    Legend,
    ChartArea,
    Scale,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    ChartTitle,
    Tooltip,
    Legend
);

const axisArrowPlugin = {
    id: 'axisArrowPlugin',
    afterDraw: (chart: any) => {
        const ctx = chart.ctx;
        const chartArea = chart.chartArea;

        ctx.save();

        ctx.beginPath();
        ctx.moveTo(chartArea.right, chartArea.bottom);
        ctx.lineTo(chartArea.right - 10, chartArea.bottom - 5);
        ctx.lineTo(chartArea.right - 10, chartArea.bottom + 5);
        ctx.fillStyle = 'gray';
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(chartArea.left, chartArea.top);
        ctx.lineTo(chartArea.left - 5, chartArea.top + 10);
        ctx.lineTo(chartArea.left + 5, chartArea.top + 10);
        ctx.fillStyle = 'gray';
        ctx.fill();

        ctx.restore();
    },
};

ChartJS.register(axisArrowPlugin);

const ExponentialGraph = () => {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<any>(null);
    const [chartDimensions, setChartDimensions] = useState({ width: 600, height: 400 });
    const [scales, setScales] = useState<{ xScale: Scale; yScale: Scale } | null>(null);
    const [chartArea, setChartArea] = useState<ChartArea | null>(null);

    useEffect(() => {
        const updateChartDimensions = () => {
            if (chartContainerRef.current) {
                const containerWidth = chartContainerRef.current.offsetWidth || 600;
                const width = containerWidth;
                const height = (containerWidth / 600) * 400; 
                setChartDimensions({ width, height });
            }
        };

        updateChartDimensions();

        window.addEventListener('resize', updateChartDimensions);

        return () => {
            window.removeEventListener('resize', updateChartDimensions);
        };
    }, []);

    const data = {
        labels: ['', '', '', '', ''], 
        datasets: [
            {
                label: 'Exponential Curve',
                data: [1, 2.7, 7.4, 20.1, 54.6], 
                borderColor: 'rgba(128, 0, 0, 1)',
                pointRadius: 1,
                borderWidth: 2, 
                fill: false,
                tension: 0.4, 
            },
        ],
    };

    const options: any = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            axisArrowPlugin: {}, 
            title: {
                display: true,
                text: 'Our roadmap',
                font: {
                    size: chartDimensions.width < 500 ? 14 : 18, 
                },
            },
            legend: {
                display: false,
            },
            tooltip: {
                enabled: false, 
            },
        },
        scales: {
            x: {
                title: {
                    display: true,
                    text: 'Time',
                    font: {
                        size: chartDimensions.width < 500 ? 10 : 12,
                    },
                },
                grid: {
                    display: false, 
                },
                ticks: {
                    display: false, 
                    font: {
                        size: chartDimensions.width < 500 ? 10 : 12,
                    },
                },
                position: 'bottom',
            },
            y: {
                title: {
                    display: true,
                    text: 'Intelligence and Usefulness',
                    font: {
                        size: chartDimensions.width < 500 ? 10 : 12,
                    },
                },
                grid: {
                    display: false, 
                },
                ticks: {
                    display: false, 
                    font: {
                        size: chartDimensions.width < 500 ? 10 : 12,
                    },
                },
                position: 'left',
            },
        },
        animation: {
            onComplete: () => {
                if (chartRef.current) {
                    const chartInstance = chartRef.current;
                    setScales({
                        xScale: chartInstance.scales.x,
                        yScale: chartInstance.scales.y,
                    });
                    setChartArea(chartInstance.chartArea);
                }
            },
        },
    };

    const points = [
        {
            xMobile: 0.5,
            yMobile: 9.1,
            xDesktop: 0.5,
            yDesktop: 7.1,
            label: 'uofcatalog',
            svgPath: '/svgs/uchicagoseal.svg',
            mobileSize: 15,
            desktopSize: 25,
        },
        {
            xMobile: 1.5,
            yMobile: 13.1,
            xDesktop: 1.5,
            yDesktop: 11.1,
            label: 'uofgenie-1',
            svgPath: '/svgs/magic-lamp.svg',
            mobileSize: 18,
            desktopSize: 28,
        },
        {
            xMobile: 2.5,
            yMobile: 20.4,
            xDesktop: 2.5,
            yDesktop: 18.4,
            label: 'uofgenie-2',
            svgPath: '/svgs/genie-2.svg',
            mobileSize: 20,
            desktopSize: 30,
        },
        {
            xMobile: 3.6,
            yMobile: 55.6,
            xDesktop: 3.6,
            yDesktop: 50.6,
            label: 'uofgenie-3',
            svgPath: '/svgs/genie-3.svg',
            mobileSize: 22,
            desktopSize: 35,
        },
    ];

    const isMobile = chartDimensions.width < 500;

    return (
        <div
            ref={chartContainerRef}
            className="relative w-full"
            style={{ height: `${chartDimensions.height}px` }}
        >
            <Line ref={chartRef} data={data} options={options} />
            {scales &&
                chartArea &&
                points.map((point, index) => {
                    const { xScale, yScale } = scales;
                    const xValue = isMobile ? point.xMobile : point.xDesktop;
                    const yValue = isMobile ? point.yMobile : point.yDesktop;
                    const xPos = xScale.getPixelForValue(xValue);
                    const yPos = yScale.getPixelForValue(yValue);

                    const imgSize = isMobile ? point.mobileSize : point.desktopSize;
                    return (
                        <div
                            key={index}
                            className="absolute flex flex-col items-center"
                            style={{
                                left: `${xPos}px`,
                                top: `${yPos}px`,
                                transform: 'translate(-50%, -50%)',
                            }}
                        >
                            <span
                                className={`${
                                    isMobile ? 'text-xs' : 'text-sm'
                                } text-center mb-1`}
                                style={{ color: 'rgba(128, 0, 0, 1)' }}
                            >
                                {point.label}
                            </span>
                            <img
                                src={point.svgPath}
                                alt={point.label}
                                style={{
                                    width: `${imgSize}px`,
                                    height: `${imgSize}px`,
                                }}
                            />
                        </div>
                    );
                })}
        </div>
    );
};

export default ExponentialGraph;