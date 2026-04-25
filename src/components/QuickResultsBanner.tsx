'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, X, Zap } from 'lucide-react';

interface QuickResult {
  title: string;
  url: string;
  engine?: string;
}

interface QuickResultsData {
  query: string;
  results: QuickResult[];
  engine?: string;
  latency_ms?: number;
}

export default function QuickResultsBanner() {
  const [data, setData] = useState<QuickResultsData | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      const custom = e as CustomEvent<QuickResultsData>;
      setData(custom.detail);
      setVisible(true);
    };

    window.addEventListener('vane-quick-results', handler);
    return () => window.removeEventListener('vane-quick-results', handler);
  }, []);

  if (!visible || !data) return null;

  return (
    <div className="fixed bottom-28 lg:bottom-10 left-1/2 -translate-x-1/2 w-[95vw] max-w-2xl z-50">
      <div className="bg-light-primary dark:bg-dark-primary border border-light-200 dark:border-dark-200 rounded-2xl shadow-2xl shadow-black/20 dark:shadow-black/60 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-light-200 dark:border-dark-200 bg-light-secondary dark:bg-dark-secondary/50">
          <div className="flex items-center gap-2">
            <Zap size={14} className="text-sky-500 fill-sky-400" />
            <span className="text-xs font-medium text-black/70 dark:text-white/70">
              Quick Results
            </span>
            <span className="text-xs text-black/40 dark:text-white/40">
              {data.latency_ms ? `${(data.latency_ms / 1000).toFixed(1)}s` : ''}
              {data.engine ? ` · ${data.engine}` : ''}
            </span>
          </div>
          <button
            onClick={() => setVisible(false)}
            className="p-1 rounded-md hover:bg-light-200 dark:hover:bg-dark-200 text-black/40 dark:text-white/40 hover:text-black/70 dark:hover:text-white/70 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-72 overflow-y-auto">
          {data.results.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-black/40 dark:text-white/40">
              No results found
            </div>
          ) : (
            <ul className="divide-y divide-light-200 dark:divide-dark-200">
              {data.results.map((result, i) => (
                <li key={i}>
                  <a
                    href={result.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-3 px-4 py-3 hover:bg-light-100 dark:hover:bg-dark-100 transition-colors group"
                  >
                    <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-sky-100 dark:bg-sky-500/20 text-sky-600 dark:text-sky-400 text-xs font-medium flex items-center justify-center flex-shrink-0">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-black/80 dark:text-white/80 group-hover:text-sky-600 dark:group-hover:text-sky-400 line-clamp-2 leading-snug">
                        {result.title}
                      </p>
                      <p className="text-xs text-black/40 dark:text-white/40 truncate mt-0.5">
                        {result.url}
                      </p>
                    </div>
                    <ExternalLink
                      size={13}
                      className="flex-shrink-0 mt-0.5 text-black/30 dark:text-white/30 group-hover:text-sky-500 transition-colors"
                    />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
