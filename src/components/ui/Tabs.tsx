import React from 'react';

interface TabItem {
  id: string;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}

interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (tabId: string) => void;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onChange,
  className = '',
}) => {
  return (
    <div className={`border-b border-stone-200 overflow-x-auto ${className}`}>
      <nav className="flex space-x-8 -mb-px px-2" aria-label="Tabs">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={`
                group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-all duration-200
                ${isActive
                  ? 'border-[#5C061E] text-[#5C061E] font-semibold'
                  : 'border-transparent text-stone-500 hover:text-stone-700 hover:border-stone-300'
                }
              `}
            >
              {tab.icon && (
                <span className={`mr-2 h-4 w-4 ${isActive ? 'text-[#5C061E]' : 'text-stone-400 group-hover:text-stone-500'}`}>
                  {tab.icon}
                </span>
              )}
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={`
                    ml-2.5 py-0.5 px-2 rounded-full text-xs font-semibold
                    ${isActive
                      ? 'bg-[#5C061E]/10 text-[#5C061E]'
                      : 'bg-stone-100 text-stone-600 group-hover:bg-stone-200'
                    }
                  `}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
};
