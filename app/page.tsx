
'use client';

import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { useChat } from 'ai/react';
import Image from 'next/image';
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowBigUp, Square } from "lucide-react";
import { useSession } from "next-auth/react";
import OpenAIMarkdown from "@/components/markdown/openai-markdown";
import ChicagoSealSvg from "@/public/svgs/magic-lamp.svg";
import clsx from 'clsx';
import Sidebar from '@/components/ui/sidebar';
import fetchThreads from './lib/fetch';
import SuggestionButtons from '@/components/ui/suggestion-component';
import ChicagoFontSvg from "@/public/svgs/uchicagofont.svg";
import Link from 'next/link';
import ToolFeedback from '@/components/ui/tool-feedback';
import magicLamp from '@/public/gifs/magic-lamp.gif';
import { TypewriterText } from '@/components/TypewriterText';


interface ThreadMessage {
  id: string;
  thread_link: string;
  message: string;
  user_or_gpt: 'user' | 'gpt';
  xata: {
    createdAt: string;
  };
}

interface Thread {
  id: string;
  name: string;
}

const typingPhrases = [
  "Ask me about UChicago Courses",
  "Professor Feedback",
  "Core Curriculum",
];

const loadingPhrases = [
  "Your wish is my command... retrieving!",
  "Granting your request... almost there!",
  "The lamp is glowing... hold tight!",
  "Summoning the answers... just a moment!",
  "The genie is thinking... patience, master!",
  "Rubbing the lamp... magic in progress!",
  "Aligning the stars... nearly done!",
  "Polishing your request... hold on!",
  "The scrolls are unfolding... stay tuned!",
  "Manifesting your wish... preparing now!",
];


export default function Page() {
  const { data: session } = useSession();
  const {
    messages,
    input,
    handleInputChange,
    append,
    isLoading,
    stop,
    setMessages,
    setInput,
  } = useChat({
    api: "/api/chat",
    keepLastMessageOnError: true,
  });

  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<ThreadMessage[]>([]);
  const [isWideScreen, setIsWideScreen] = useState(true);
  const [threads, setThreads] = useState<Thread[]>([]);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [randomLoadingPhrase, setRandomLoadingPhrase] = useState('');

  useLayoutEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 768px)");

    const handleMediaQueryChange = (e: MediaQueryListEvent) => {
      const matches = e.matches;
      setIsWideScreen(matches);
      setIsSidebarExpanded(matches);
    };

    setIsWideScreen(mediaQuery.matches);
    setIsSidebarExpanded(mediaQuery.matches);

    mediaQuery.addEventListener('change', handleMediaQueryChange);

    return () => {
      mediaQuery.removeEventListener('change', handleMediaQueryChange);
    };
  }, []);

  useEffect(() => {
    if (session?.user?.email) {
      fetchThreads(session.user.email).then((threads: any) => setThreads(threads));
    } else {
      setThreads([]);
    }
  }, [session]);

  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const toggleSidebar = () => {
    setIsSidebarExpanded(!isSidebarExpanded);
  };

  const handleLogout = () => {
    console.log('Logging out...');
  };

  const handleCallToAction = async (actionText: string) => {
    let threadId = selectedThreadId;

    if (!threadId) {
      try {
        const newThreadId = await createNewThread(actionText);
        threadId = newThreadId;
        setSelectedThreadId(threadId);
      } catch (error) {
        console.error("Failed to create new thread:", error);
        return;
      }
    }

    try {
      await append(
        { role: 'user', content: actionText },
        {
          data: { threadId },
        }
      );
    } catch (error) {
      console.error("Error appending message:", error);
    }
  };

  const formatMessage = (content: any) => {
    return (
      <OpenAIMarkdown
        isLoading={isLoading}
        text={content}
        onAction={(actionText) => handleCallToAction(actionText)}
      />
    );
  };

  const fetchThreadMessages = async (threadId: string) => {
    try {
      const response = await fetch(`/api/thread-messages?threadId=${threadId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch thread messages');
      }
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching thread messages:', error);
      return [];
    }
  };

  const handleThreadSelect = async (threadId: string) => {
    try {
      setSelectedThreadId(threadId);

      const fetchedMessages = await fetchThreadMessages(threadId);

      const transformedMessages = fetchedMessages.map((msg: ThreadMessage) => ({
        id: msg.id,
        role: msg.user_or_gpt === 'user' ? 'user' : 'assistant',
        content: msg.message,
      }));

      setThreadMessages(fetchedMessages);
      setMessages(transformedMessages);
      setInput('');
    } catch (error) {
      console.error('Error handling thread selection:', error);
    }
  };

  const createNewThread = async (name?: string) => {
    const threadName = name || `Chat ${new Date().toLocaleString()}`;

    try {
      const response = await fetch('/api/create-thread', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: threadName }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create thread: ${response.status}`);
      }

      const newThread = await response.json();

      if (session?.user?.email) {
        setThreads((prevThreads) => [
          { id: newThread.id, name: newThread.name },
          ...prevThreads,
        ]);
      }

      setMessages([]);
      setInput('');
      setSelectedThreadId(newThread.id);

      return newThread.id;
    } catch (error) {
      console.error('Error creating thread:', error);
      throw error;
    }
  };

  const handleSuggestionSelected = (suggestion: { type: 'set' | 'append'; text: string }) => {
    if (suggestion.type === 'set') {
      setInput(suggestion.text);
    } else if (suggestion.type === 'append') {
      setInput((prevInput) => `${prevInput}${suggestion.text}`.trim());
    }
    inputRef.current?.focus();

    if (inputRef.current) {
      adjustTextareaHeight(inputRef.current);
      inputRef.current.scrollTop = inputRef.current.scrollHeight;
    }
  };

  const handleSubmitForm = async (
    e: React.FormEvent<HTMLFormElement> | React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    e.preventDefault();

    if (input.trim() === '') {
      return;
    }

    try {
      let threadId = selectedThreadId;

      if (!threadId) {
        const newThreadId = await createNewThread(input.trim());
        threadId = newThreadId;
        setSelectedThreadId(threadId);
      }

      if (threadId) {
        await append(
          {
            content: input,
            role: 'user',
          },
          {
            data: { threadId },
          }
        );
        setInput('');
        if (inputRef.current) {
          inputRef.current.style.height = 'auto';
        }
      }
    } catch (error) {
      console.error("Error in form submission:", error);
    }
  };

  const customHandleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    handleInputChange(e);
    if (inputRef.current) {
      adjustTextareaHeight(inputRef.current);
    }
  };

  const catalogRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (catalogRef.current) {
      catalogRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  const adjustTextareaHeight = (textarea: HTMLTextAreaElement) => {
    textarea.style.height = 'auto';
    const lineHeight = parseInt(getComputedStyle(textarea).lineHeight || '16');
    const maxHeight = lineHeight * 2 + 4;
    if (textarea.scrollHeight <= maxHeight) {
      textarea.style.height = `${textarea.scrollHeight}px`;
    } else {
      textarea.style.height = `${maxHeight}px`;
    }
  };

  const assistantMessageExists = messages.some((msg) => msg.role === 'assistant');

 
  useEffect(() => {
    if (isLoading) {
      const randomIndex = Math.floor(Math.random() * loadingPhrases.length);
      setRandomLoadingPhrase(loadingPhrases[randomIndex]);
    }
  }, [isLoading]);

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        isSidebarExpanded={isSidebarExpanded}
        toggleSidebar={toggleSidebar}
        handleLogout={handleLogout}
        isWideScreen={isWideScreen}
        threads={threads}
        onThreadSelect={handleThreadSelect}
        createNewThread={createNewThread}
        currentThreadId={selectedThreadId}
      />

      {/* Main Chat Area */}
      <div className="flex-[50%] flex flex-col flex-grow overflow-hidden bg-gray-50 ">
        {messages.length === 0 && threadMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center mt-10 p-4">
            <Image
              src={ChicagoFontSvg}
              alt="UChicago Logo"
              width={300}
              height={150}
              className=""
            />
            {/* 7. Display random typing phrase with shimmering effect */}
            <div className="text-3xl font-medium tracking-tight text-center mt-52 h-20">
              <TypewriterText phrases={typingPhrases} />
            </div>

            <form
              onSubmit={handleSubmitForm}
              className="w-full max-w-3xl mx-auto px-4 space-y-2"
            >
              <div className="relative w-full">
                <div className="flex rounded-lg bg-slate-200">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={customHandleInputChange}
                    placeholder="Message here"
                    className="flex-grow rounded-l-lg bg-slate-200 focus:outline-none px-4 py-1 resize-none self-center"
                    disabled={isLoading}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        handleSubmitForm(e as any);
                      }
                    }}
                    rows={1}
                    style={{
                      overflowY: 'auto',
                    }}
                  />
                  <Button
                    type={isLoading ? 'button' : 'submit'}
                    onClick={isLoading ? stop : undefined}
                    className={`rounded-full flex items-center justify-center m-2 ${
                      isLoading ? 'bg-red-700' : 'bg-[#800000] hover:bg-[#600000]'
                    }`}
                  >
                    {isLoading ? (
                      <Square className="h-5 w-5" />
                    ) : (
                      <ArrowBigUp className="h-5 w-5" />
                    )}
                  </Button>
                </div>

                {/* SuggestionButtons */}
                <SuggestionButtons
                  handleSuggestionSelected={handleSuggestionSelected}
                  handleCallToAction={handleCallToAction}
                  inChat={false}
                />
                                <Link
                  className="max-w-2xl w-full items-center justify-center flex flex-col mb-2 italic cursor-pointer text-sm mt-2"
                  href="/about#questions"
                >
                  I can't answer all your questions just yet...{' '}
                  <span className="font-bold text-blue-600 hover:text-blue-800 underline transition-colors duration-200 ease-in-out ">
                    click here to learn more about me!
                  </span>
                </Link>


            
              </div>
        
           
            </form>
          
          </div>
        ) : (
          <>
            <div className="flex-grow overflow-auto">
              <ScrollArea className="flex-1 p-4 overflow-y-auto">
                <div className="max-w-3xl mx-auto space-y-4 w-full flex flex-col">
                  {[...messages].map((message, index) => (
                    <div
                      key={index}
                      className={clsx(
                        'rounded-lg p-3',
                        'text-gray-800',
                        message.role === 'user'
                          ? 'bg-slate-200 max-w-[75%] flex items-start ml-auto justify-end whitespace-pre-line'
                          : 'bg-gray-50 max-w-[98%] relative flex items-start'
                      )}
                    >
                      {message.role === 'assistant' ? (
                        <div className="flex">
                          <div className="mr-2 flex-shrink-0">
                            <Image
                              src={ChicagoSealSvg}
                              alt="Magic Lamp"
                              width={25}
                              height={25}
                            />
                          </div>
                          <div>
                            {message.toolInvocations && message.toolInvocations.length > 0 ? (
                              <ToolFeedback
                                toolInvocations={message.toolInvocations}
                                formatMessage={formatMessage}
                                messageContent={message.content}
                                isLoading={isLoading}
                                handleCallToAction={handleCallToAction}
                              />
                            ) : (
                              <OpenAIMarkdown
                                isLoading={isLoading}
                                text={message.content}
                                onAction={(actionText) => handleCallToAction(actionText)}
                              />
                            )}
                          </div>
                        </div>
                      ) : (
                        <div
                          className={clsx(
                            'rounded-lg',
                            'text-gray-800',
                            'bg-slate-200 flex items-start ml-auto justify-end  whitespace-pre-line'
                          )}
                        >
                          {message.content}
                        </div>
                      )}
                    </div>
                  ))}
                  {/* Placeholder Assistant Message When Loading */}
                  {isLoading && !assistantMessageExists && (
                    <div
                      className={clsx(
                        'rounded-lg p-3',
                        'text-gray-800',
                        'bg-gray-50 max-w-[98%] relative flex items-start'
                      )}
                    >
                      <div className="flex">
                        <div className="mr-2 flex-shrink-0">
                          <Image
                            src={ChicagoSealSvg}
                            alt="Magic Lamp"
                            width={25}
                            height={25}
                          />
                        </div>
                        <div>
                          <div className="flex items-center text-slate-600">
                            {/* 8. Display random loading phrase with shimmering effect */}
                            <span className="animate-pulse">{randomLoadingPhrase}</span>
                            <img
                              src={magicLamp.src}
                              alt="Loading..."
                              className="h-8 w-8 mr-2"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* Dummy div for scrolling */}
                  <div ref={chatContainerRef} />
                </div>
              </ScrollArea>
            </div>

            {/* Input Area */}
            <div className="bg-gray-50 flex-none">
              <div className="w-full max-w-3xl mx-auto px-4 pt-2 pb-4">
                <form onSubmit={handleSubmitForm} className="w-full space-y-2">
                  <div className="relative w-full">
                    <div className="flex rounded-lg bg-slate-200">
                      <textarea
                        ref={inputRef}
                        value={input}
                        onChange={customHandleInputChange}
                        placeholder="Ask about UChicago core courses..."
                        className="flex-grow rounded-l-lg bg-slate-200 focus:outline-none px-4 py-2 resize-none self-center"
                        disabled={isLoading}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            handleSubmitForm(e as any);
                          }
                        }}
                        rows={1}
                        style={{
                          overflowY: 'auto',
                        }}
                      />
                      <Button
                        type={isLoading ? 'button' : 'submit'}
                        onClick={isLoading ? stop : undefined}
                        className={`rounded-full flex items-center justify-center m-2 ${
                          isLoading ? 'bg-red-700' : 'bg-[#800000] hover:bg-[#600000]'
                        }`}
                      >
                        {isLoading ? (
                          <Square className="h-5 w-5" />
                        ) : (
                          <ArrowBigUp className="h-5 w-5" />
                        )}
                      </Button>
                    </div>

                    {/* SuggestionButtons */}
                    <SuggestionButtons
                      handleSuggestionSelected={handleSuggestionSelected}
                      handleCallToAction={handleCallToAction}
                      inChat={true}
                    />
                  </div>
             
                  <p className="text-xs text-slate-400">
                    Learn what questions the{' '}
                    <Link
                      href="/about"
                      className="cursor-pointer underline"
                      ref={catalogRef}
                    >
                      UChicago Genie is good at answering
                    </Link>
                  </p>

                </form>

               

              </div>
            </div>
          </>
        )}
           {messages.length === 0 && <footer className="text-center h-full text-sm text-gray-500  flex items-end justify-center lg:pr-20 sm:pr-10">
                <p className="">This is not an official UChicago resource</p>
              </footer>}
      </div>

    </div>
  );
}