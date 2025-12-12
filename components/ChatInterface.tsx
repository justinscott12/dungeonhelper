'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, User, Bot, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import ReactMarkdown from 'react-markdown';
import type { ChatMessage } from '@/lib/types';

interface ChatInterfaceProps {}

export function ChatInterface({}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [mounted, setMounted] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load messages from localStorage after hydration
  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('chat-messages');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          setMessages(
            parsed.map((msg: any) => ({
              ...msg,
              timestamp: new Date(msg.timestamp),
            }))
          );
        } catch (e) {
          console.error('Failed to load chat messages:', e);
        }
      }
    }
  }, []);

  // Save messages to localStorage whenever they change
  useEffect(() => {
    if (mounted && typeof window !== 'undefined' && messages.length > 0) {
      localStorage.setItem('chat-messages', JSON.stringify(messages));
    }
  }, [messages, mounted]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleClearChat = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('chat-messages');
    }
    setMessages([]);
    setError(null);
    setInput('');
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const query = input.trim();
    const userMessage: ChatMessage = {
      role: 'user',
      content: query,
      timestamp: new Date(),
    };

    // Build updated messages array with user message
    const updatedMessages = [...messages, userMessage];
    
    setMessages(updatedMessages);
    setInput('');
    setLoading(true);
    setError(null);

    // Add placeholder for assistant message
    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      },
    ]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
          query: query,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Chat failed');
      }

      // Stream the response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          assistantContent += chunk;

          // Update the last message with streaming content
          setMessages((prev) => {
            const newMessages = [...prev];
            const lastMessage = newMessages[newMessages.length - 1];
            if (lastMessage.role === 'assistant') {
              lastMessage.content = assistantContent;
            }
            return newMessages;
          });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      // Remove the placeholder assistant message
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full gap-4 min-h-0">
      <ScrollArea className="flex-1 min-h-0" ref={scrollAreaRef}>
        <div className="space-y-4 p-4">
          {mounted && messages.length === 0 && (
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-2 text-center">
                  <p className="font-semibold">Day 1 Mechanics Assistant</p>
                  <p className="text-sm text-muted-foreground">
                    Describe what you're seeing and I'll help figure out the mechanic! I can:
                  </p>
                  <ul className="text-xs text-muted-foreground space-y-1 mt-3 text-left max-w-md mx-auto">
                    <li>• Analyze mechanics you describe and suggest solutions</li>
                    <li>• Ask questions to narrow down what you're seeing</li>
                    <li>• Connect patterns to similar mechanics from other dungeons</li>
                    <li>• Guide you through solving puzzles step-by-step</li>
                  </ul>
                  <p className="text-xs text-primary mt-3 font-medium">
                    Try: "We see symbols on wheels and need to match them" or "There are beams we need to direct somewhere"
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {mounted && messages.map((message, idx) => (
            <div
              key={idx}
              className={`flex gap-3 ${
                message.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {message.role === 'assistant' && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
              )}
              <Card
                className={`max-w-[80%] ${
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                }`}
              >
                <CardContent className="pt-4">
                  <div className="flex items-start gap-2">
                    {message.role === 'user' && (
                      <User className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    )}
                    <div className="flex-1">
                      {message.content ? (
                        message.role === 'assistant' ? (
                          <div className="text-sm">
                            <ReactMarkdown
                              components={{
                                h1: ({ children }) => <h1 className="text-lg font-bold mt-4 mb-2">{children}</h1>,
                                h2: ({ children }) => <h2 className="text-base font-bold mt-3 mb-2">{children}</h2>,
                                h3: ({ children }) => <h3 className="text-sm font-bold mt-2 mb-1">{children}</h3>,
                                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                                ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1 ml-2">{children}</ul>,
                                ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1 ml-2">{children}</ol>,
                                li: ({ children }) => <li>{children}</li>,
                                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                                em: ({ children }) => <em className="italic">{children}</em>,
                                code: ({ children }) => <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">{children}</code>,
                                pre: ({ children }) => <pre className="bg-muted p-2 rounded text-xs font-mono overflow-x-auto mb-2">{children}</pre>,
                                hr: () => <hr className="my-3 border-border" />,
                              }}
                            >
                              {message.content}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                        )
                      ) : (
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="text-sm text-muted-foreground">Thinking...</span>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
              {message.role === 'user' && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-4 w-4 text-primary" />
                </div>
              )}
            </div>
          ))}

          {mounted && error && (
            <Card className="border-destructive">
              <CardContent className="pt-4">
                <p className="text-sm text-destructive">{error}</p>
              </CardContent>
            </Card>
          )}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      <div className="flex gap-2">
        <Input
          type="text"
          placeholder="Describe what you're seeing and I'll help figure it out..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !loading) {
              handleSend();
            }
          }}
        />
        <Button
          variant="outline"
          size="icon"
          onClick={handleClearChat}
          disabled={loading || messages.length === 0}
          title="Clear chat history"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
        <Button onClick={handleSend} disabled={loading || !input.trim()}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
