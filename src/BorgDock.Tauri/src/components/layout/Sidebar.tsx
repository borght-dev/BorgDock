import { PRDetailPanel } from '@/components/pr-detail/PRDetailPanel';
import { usePrStore } from '@/stores/pr-store';
import { useUiStore } from '@/stores/ui-store';
import { FilterBar } from './FilterBar';
import { Header } from './Header';
import { SearchBar } from './SearchBar';
import { StatusBar } from './StatusBar';

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
    <div className="sidebar-shell">
      <Header />
      {activeSection === 'prs' && !selectedPr && (
        <div className="sidebar-toolbar">
          <FilterBar />
          <SearchBar />
        </div>
      )}
      <div className="sidebar-content" data-section={activeSection}>
        {selectedPr ? (
          <PRDetailPanel key={selectedPr.pullRequest.number} pr={selectedPr} />
        ) : (
          children
        )}
      </div>
      <StatusBar />
    </div>
  );
}
