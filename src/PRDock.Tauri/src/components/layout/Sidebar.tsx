import { Header } from './Header';
import { FilterBar } from './FilterBar';
import { SearchBar } from './SearchBar';
import { StatusBar } from './StatusBar';
import { useUiStore } from '@/stores/ui-store';

interface SidebarProps {
  children: React.ReactNode;
}

export function Sidebar({ children }: SidebarProps) {
  const activeSection = useUiStore((s) => s.activeSection);

  return (
    <div className="flex h-screen w-full flex-col bg-[var(--color-background)]">
      <Header />
      {activeSection === 'prs' && (
        <>
          <FilterBar />
          <SearchBar />
        </>
      )}
      <div className="flex-1 overflow-y-auto px-2 py-1">{children}</div>
      <StatusBar />
    </div>
  );
}
