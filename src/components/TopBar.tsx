import React from 'react';
import { Download } from 'lucide-react';
import { WorkflowTab } from '../types/studio';

interface TopBarProps {
  activeTab: WorkflowTab;
  onSelectTab: (tab: WorkflowTab) => void;
  onOpenExport: () => void;
  canExport: boolean;
}

const NAV_TABS: Array<{ id: WorkflowTab; label: string }> = [
  { id: 'inspect', label: 'Source' },
  { id: 'retopology', label: 'Retopology' },
  { id: 'bake', label: 'Bake Maps' },
  { id: 'ai-studio', label: 'AI Studio' },
];

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  onSelectTab,
  onOpenExport,
  canExport,
}) => {
  return (
    <header className="h-14 px-6 bg-[#171A21] border-b border-white/10 flex items-center justify-between gap-8 shrink-0">
      {/* Zone 1: Single-element Brand Wordmark */}
      <a
        href="#top"
        onClick={(e) => {
          e.preventDefault();
          onSelectTab('inspect');
        }}
        className="font-display text-lg font-semibold tracking-tight text-slate-100 whitespace-nowrap shrink-0"
      >
        TopoBake Studio
      </a>

      {/* Zone 2: Concise single-line navigation links */}
      <nav className="flex items-center gap-6">
        {NAV_TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              className={`relative py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                active ? 'text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
              {active && (
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-500 rounded-full" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Single Primary Action */}
      <div className="shrink-0">
        <button
          type="button"
          onClick={onOpenExport}
          disabled={!canExport}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
            canExport
              ? 'bg-blue-600 hover:bg-blue-500 text-white'
              : 'bg-white/5 text-slate-500 cursor-not-allowed'
          }`}
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export Asset</span>
        </button>
      </div>
    </header>
  );
};
