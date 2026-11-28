import pullRequestsHome from '../assets/iphone/review/pull-requests-home.png';
import pullRequestsDisplay from '../assets/iphone/review/pull-requests-display.png';
import pullRequestsFilter from '../assets/iphone/review/pull-requests-filter.png';
import pullRequestsGrouped from '../assets/iphone/review/pull-requests-grouped.png';
import watchedRepositories from '../assets/iphone/review/watched-repositories.png';
import accountStatus from '../assets/iphone/review/account-status.png';
import proofGallery from '../assets/iphone/review/proof-gallery.png';
import pullRequest from '../assets/iphone/review/pull-request.png';
import pullRequestReviewers from '../assets/iphone/review/pull-request-reviewers.png';
import workItem from '../assets/iphone/review/work-item.png';
import workItemDetails from '../assets/iphone/review/work-item-details.png';
import workItemDark from '../assets/iphone/review/work-item-dark.png';
import reviewBrief from '../assets/iphone/review/review-brief.png';
import reviewWalk from '../assets/iphone/review/review-walk.png';
import reviewCommentLines from '../assets/iphone/review/review-comment-lines.png';
import reviewRereview from '../assets/iphone/review/review-rereview.png';
import reviewDecide from '../assets/iphone/review/review-decide.png';
import reviewEnd from '../assets/iphone/review/review-end.png';
import connect from '../assets/iphone/review/connect.png';
import setupGithubToken from '../assets/iphone/review/setup-github-token.png';
import setupAzureDevops from '../assets/iphone/review/setup-azure-devops.png';
import setupRepositories from '../assets/iphone/review/setup-repositories.png';
import settings from '../assets/iphone/review/settings.png';
import listDark from '../../../docs/proof/ios-pr-list/list-dark.png';
import listFilters from '../../../docs/proof/ios-pr-list/list-filters.png';
import filterSheet from '../../../docs/proof/ios-pr-list/filter-sheet.png';
import filterValues from '../../../docs/proof/ios-pr-list/filter-values.png';
import saveView from '../../../docs/proof/ios-pr-list/save-view.png';
import savedViewEdited from '../../../docs/proof/ios-pr-list/saved-view-edited.png';
import typingAFilter from '../../../docs/proof/ios-pr-list/typing-a-filter.png';
import authorRunMenu from '../../../docs/proof/ios-quick-review-next/author-run-menu.png';
import clearedByE2eReport from '../../../docs/proof/ios-quick-review-next/cleared-by-e2e-report.png';
import clearedBySharedFailure from '../../../docs/proof/ios-quick-review-next/cleared-by-shared-failure.png';
import endCardRun from '../../../docs/proof/ios-quick-review-next/end-card-run.png';
import endCardSingle from '../../../docs/proof/ios-quick-review-next/end-card-single.png';
import endCardNext from '../../../docs/proof/ios-quick-review-next/end-card-next.png';
import merge from '../assets/iphone/review/bypass-merge.png';
import confirmMerge from '../assets/iphone/review/bypass-merge-confirm.png';

import companionFocus from '../assets/iphone/focus.png';
import companionWork from '../assets/iphone/work.png';
import companionSprint from '../assets/iphone/sprint.png';
import companionSearch from '../assets/iphone/search.png';
import companionNotes from '../assets/iphone/notes.png';
import companionCapture from '../assets/iphone/capture.png';
import companionItem from '../assets/iphone/item.png';
import companionSources from '../assets/iphone/sources.png';
import type { Theme } from './media';

type PhoneScreen = { image: ImageMetadata; title: string; theme: Theme };

export const reviewScreens = {
  'pull-requests-home': { image: pullRequestsHome, title: 'Pull requests across watched repositories', theme: 'light' },
  'pull-requests-display': { image: pullRequestsDisplay, title: 'Display and grouping options', theme: 'light' },
  'pull-requests-filter': { image: pullRequestsFilter, title: 'Filter for draft pull requests', theme: 'light' },
  'pull-requests-grouped': { image: pullRequestsGrouped, title: 'Draft pull requests grouped by repository', theme: 'light' },
  'pull-request': { image: pullRequest, title: 'Pull request checks and proof', theme: 'light' },
  'pull-request-reviewers': { image: pullRequestReviewers, title: 'Reviewers and their decisions', theme: 'light' },
  'work-item': { image: workItem, title: 'Linked Azure DevOps work item', theme: 'light' },
  'work-item-details': { image: workItemDetails, title: 'Work item fields and discussion', theme: 'light' },
  'work-item-dark': { image: workItemDark, title: 'Work item in dark mode', theme: 'dark' },
  'review-brief': { image: reviewBrief, title: 'Review brief before opening the files', theme: 'light' },
  'review-walk': { image: reviewWalk, title: 'A review thread below the lines it discusses', theme: 'light' },
  'review-comment-lines': { image: reviewCommentLines, title: 'Write a comment on selected lines', theme: 'light' },
  'review-rereview': { image: reviewRereview, title: 'Changes since your last review', theme: 'light' },
  'review-decide': { image: reviewDecide, title: 'Review decision and auto-merge', theme: 'light' },
  'merge': { image: merge, title: 'Merge methods and branch protections', theme: 'light' },
  'confirm-merge': { image: confirmMerge, title: 'Confirm a bypass merge', theme: 'light' },
  'review-end': { image: reviewEnd, title: 'Your merge-ready pull requests after a walk-through', theme: 'light' },
  'connect': { image: connect, title: 'Connect BorgDock Review', theme: 'light' },
  'setup-github-token': { image: setupGithubToken, title: 'Verify GitHub token permissions', theme: 'light' },
  'setup-azure-devops': { image: setupAzureDevops, title: 'Connect an Azure DevOps project', theme: 'light' },
  'setup-repositories': { image: setupRepositories, title: 'Choose which repositories to watch', theme: 'light' },
  'watched-repositories': { image: watchedRepositories, title: 'Watched repositories and review requests', theme: 'light' },
  'account-status': { image: accountStatus, title: 'Replace an expired GitHub token', theme: 'light' },
  'proof-gallery': { image: proofGallery, title: 'Swipe between pull request screenshots', theme: 'light' },
  'settings': { image: settings, title: 'Account and refresh settings', theme: 'light' },
} satisfies Record<string, PhoneScreen>;

export const companionScreens = {
  'list-dark': { image: listDark, title: 'Pull request list in dark mode', theme: 'dark' },
  'list-filters': { image: listFilters, title: 'Pull requests with active filters', theme: 'light' },
  'filter-sheet': { image: filterSheet, title: 'Filter by pull request properties', theme: 'light' },
  'filter-values': { image: filterValues, title: 'Pick filter values', theme: 'light' },
  'save-view': { image: saveView, title: 'Name a saved view', theme: 'light' },
  'saved-view-edited': { image: savedViewEdited, title: 'Edited saved view', theme: 'light' },
  'typing-a-filter': { image: typingAFilter, title: 'Search suggestions while typing', theme: 'light' },
  'author-run-menu': { image: authorRunMenu, title: 'Start a review run for one author', theme: 'light' },
  'cleared-by-e2e-report': { image: clearedByE2eReport, title: 'E2E report on a failing check', theme: 'light' },
  'cleared-by-shared-failure': { image: clearedBySharedFailure, title: 'Check failure shared by other pull requests', theme: 'light' },
  'end-card-run': { image: endCardRun, title: 'Author review run summary', theme: 'light' },
  'end-card-single': { image: endCardSingle, title: 'Single review summary', theme: 'light' },
  'end-card-next': { image: endCardNext, title: 'Next pull request after a review', theme: 'light' },
  'companion-focus': { image: companionFocus, title: 'Focus review queue and waiting agents', theme: 'light' },
  'companion-work': { image: companionWork, title: 'Work items grouped by state', theme: 'light' },
  'companion-sprint': { image: companionSprint, title: 'Sprint burndown and items to watch', theme: 'light' },
  'companion-search': { image: companionSearch, title: 'Search across PRs, items, notes and threads', theme: 'light' },
  'companion-notes': { image: companionNotes, title: 'Shared Markdown vault and recent notes', theme: 'light' },
  'companion-capture': { image: companionCapture, title: 'Quick capture linked to a pull request', theme: 'light' },
  'companion-item': { image: companionItem, title: 'Work item activity and agent actions', theme: 'light' },
  'companion-sources': { image: companionSources, title: 'Connected sources and agent machines', theme: 'light' },
} satisfies Record<string, PhoneScreen>;

export const phoneScreens = { ...reviewScreens, ...companionScreens };
