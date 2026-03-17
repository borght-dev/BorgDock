import { Header } from './Header';
import { FilterBar } from './FilterBar';
import { SearchBar } from './SearchBar';
import { StatusBar } from './StatusBar';
import { useUiStore } from '@/stores/ui-store';
import { usePrStore } from '@/stores/pr-store';
import { PRDetailPanel } from '@/components/pr-detail/PRDetailPanel';

interface SidebarProps {
  children: React.ReactNode;
}

export function Sidebar({ children }: SidebarProps) {
  const activeSection = useUiStore((s) => s.activeSection);
  const selectedPrNumber = useUiStore((s) => s.selectedPrNumber);
  const pullRequests = usePrStore((s) => s.pullRequests);

  const selectedPr = selectedPrNumber
    ? pullRequests.find((p) => p.pullRequest.number === selectedPrNumber)
    : undefined;

  return (
    <div className="flex h-screen w-full flex-col bg-[var(--color-background)]">
      <Header />
      {activeSection === 'prs' && !selectedPr && (
        <>
          <FilterBar />
          <SearchBar />
        </>
      )}
      <div className="relative flex-1 overflow-y-auto px-2 py-1">
        {children}
        {selectedPr && <PRDetailPanel pr={selectedPr} />}
      </div>
      <StatusBar />
    </div>
  );
}
