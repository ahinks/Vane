'use client';

import { cn } from '@/lib/utils';
import { ArrowUp, Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import AttachSmall from './MessageInputActions/AttachSmall';
import { useChat } from '@/lib/hooks/useChat';
import { toast } from 'sonner';

type SearchMode = 'deep' | 'quick';

const MessageInput = () => {
  const { loading, sendMessage } = useChat();

  const [copilotEnabled, setCopilotEnabled] = useState(false);
  const [message, setMessage] = useState('');
  const [textareaRows, setTextareaRows] = useState(1);
  const [mode, setMode] = useState<'multi' | 'single'>('single');
  const [searchMode, setSearchMode] = useState<SearchMode>('deep');
  const [quickLoading, setQuickLoading] = useState(false);

  useEffect(() => {
    if (textareaRows >= 2 && message && mode === 'single') {
      setMode('multi');
    } else if (!message && mode === 'multi') {
      setMode('single');
    }
  }, [textareaRows, mode, message]);

  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;

      const isInputFocused =
        activeElement?.tagName === 'INPUT' ||
        activeElement?.tagName === 'TEXTAREA' ||
        activeElement?.hasAttribute('contenteditable');

      if (e.key === '/' && !isInputFocused) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleQuickSearch = async (query: string) => {
    if (!query.trim()) return;
    setQuickLoading(true);
    try {
      const params = new URLSearchParams({ q: query, limit: '6' });
      const res = await fetch(`/api/vane/quick?${params}`);
      if (!res.ok) throw new Error('Quick search failed');
      const data = await res.json();

      // Dispatch a custom event that the Chat component listens to
      // to display results inline
      const event = new CustomEvent('vane-quick-results', {
        detail: {
          query,
          results: data.results || [],
          engine: data.engine,
          latency_ms: data.latency_ms,
        },
      });
      window.dispatchEvent(event);
    } catch (err) {
      toast.error('Quick search failed. Falling back to deep search.');
      sendMessage(message);
    } finally {
      setQuickLoading(false);
      setMessage('');
    }
  };

  return (
    <form
      onSubmit={(e) => {
        if (loading) return;
        e.preventDefault();
        if (searchMode === 'quick') {
          handleQuickSearch(message);
        } else {
          sendMessage(message);
          setMessage('');
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey && !loading) {
          e.preventDefault();
          if (searchMode === 'quick') {
            handleQuickSearch(message);
          } else {
            sendMessage(message);
            setMessage('');
          }
        }
      }}
      className={cn(
        'relative bg-light-secondary dark:bg-dark-secondary p-4 flex items-center overflow-visible border border-light-200 dark:border-dark-200 shadow-sm shadow-light-200/10 dark:shadow-black/20 transition-all duration-200 focus-within:border-light-300 dark:focus-within:border-dark-300',
        mode === 'multi' ? 'flex-col rounded-2xl' : 'flex-row rounded-full',
      )}
    >
      {/* Search mode toggle — Deep | Quick */}
      <button
        type="button"
        onClick={() => setSearchMode(searchMode === 'deep' ? 'quick' : 'deep')}
        className={cn(
          'flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border transition-all duration-150 mr-2 flex-shrink-0',
          searchMode === 'deep'
            ? 'border-light-300 dark:border-dark-300 bg-light-100 dark:bg-dark-100 text-black/70 dark:text-white/70'
            : 'border-sky-500/50 bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400',
        )}
        title={searchMode === 'deep' ? 'Switch to Quick mode (raw SearXNG)' : 'Switch to Deep mode (AI synthesis)'}
      >
        <Zap size={11} className={searchMode === 'quick' ? 'fill-sky-400 text-sky-500' : ''} />
        {searchMode === 'deep' ? 'Deep' : 'Quick'}
      </button>

      {mode === 'single' && <AttachSmall />}
      <TextareaAutosize
        ref={inputRef}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onHeightChange={(height, props) => {
          setTextareaRows(Math.ceil(height / props.rowHeight));
        }}
        className="transition bg-transparent dark:placeholder:text-white/50 placeholder:text-sm text-sm dark:text-white resize-none focus:outline-none w-full px-2 max-h-24 lg:max-h-36 xl:max-h-48 flex-grow flex-shrink"
        placeholder={searchMode === 'quick' ? 'Quick search (raw results)...' : 'Ask a follow-up'}
      />
      {mode === 'single' && (
        <button
          disabled={message.trim().length === 0 || loading || quickLoading}
          className="bg-[#24A0ED] text-white disabled:text-black/50 dark:disabled:text-white/50 hover:bg-opacity-85 transition duration-100 disabled:bg-[#e0e0dc79] dark:disabled:bg-[#ececec21] rounded-full p-2 flex-shrink-0"
        >
          {quickLoading ? (
            <span className="animate-spin block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
          ) : (
            <ArrowUp className="bg-background" size={17} />
          )}
        </button>
      )}
      {mode === 'multi' && (
        <div className="flex flex-row items-center justify-between w-full pt-2">
          <AttachSmall />
          <button
            disabled={message.trim().length === 0 || loading || quickLoading}
            className="bg-[#24A0ED] text-white disabled:text-black/50 dark:disabled:text-white/50 hover:bg-opacity-85 transition duration-100 disabled:bg-[#e0e0dc79] dark:disabled:bg-[#ececec21] rounded-full p-2"
          >
            {quickLoading ? (
              <span className="animate-spin block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <ArrowUp className="bg-background" size={17} />
            )}
          </button>
        </div>
      )}
    </form>
  );
};

export default MessageInput;
