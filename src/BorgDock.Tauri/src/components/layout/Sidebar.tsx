import { PrDetailPanel } from '@/components/pr-detail/PRDetailPanel';
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
  const closedPullRequests = usePrStore((s) => s.closedPullRequests);

  // After an optimistic merge the PR moves from pullRequests → closedPullRequests.
  // Resolving from both lists keeps the inline detail panel (and its MergedCard)
  // visible through the merge celebration instead of snapping back to the list.
  const selectedPr = selectedPrNumber
    ? pullRequests.find((p) => p.pullRequest.number === selectedPrNumber) ??
      closedPullRequests.find((p) => p.pullRequest.number === selectedPrNumber)
    : undefined;

  return (
    <div className="sidebar-shell">
      <Header />
      {activeSection === 'prs' && !selectedPr && (
        <div className="sidebar-toolbar flex items-center gap-2 px-2.5 py-1.5">
          <FilterBar />
          <SearchBar />
        </div>
      )}
      <div className="sidebar-content" data-section={activeSection}>
        {selectedPr ? (
          <PrDetailPanel key={selectedPr.pullRequest.number} pr={selectedPr} />
        ) : (
          children
        )}
      </div>
      <StatusBar left="" right="" />
    </div>
  );
}
