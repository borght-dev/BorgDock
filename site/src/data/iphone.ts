import pullRequestsHome from '../../../docs/proof/ios-borgdock-review/pull-requests-home.png';
import pullRequestsDisplay from '../../../docs/proof/ios-borgdock-review/pull-requests-display.png';
import pullRequest from '../../../docs/proof/ios-borgdock-review/pull-request.png';
import pullRequestReviewers from '../../../docs/proof/ios-borgdock-review/pull-request-reviewers.png';
import workItem from '../../../docs/proof/ios-borgdock-review/work-item.png';
import workItemDetails from '../../../docs/proof/ios-borgdock-review/work-item-details.png';
import workItemDark from '../../../docs/proof/ios-borgdock-review/work-item-dark.png';
import reviewBrief from '../../../docs/proof/ios-borgdock-review/review-brief.png';
import reviewWalk from '../../../docs/proof/ios-borgdock-review/review-walk.png';
import reviewCommentLines from '../../../docs/proof/ios-borgdock-review/review-comment-lines.png';
import reviewRereview from '../../../docs/proof/ios-borgdock-review/review-rereview.png';
import reviewDecide from '../../../docs/proof/ios-borgdock-review/review-decide.png';
import reviewEnd from '../../../docs/proof/ios-borgdock-review/review-end.png';
import connect from '../../../docs/proof/ios-borgdock-review/connect.png';
import setupGithubToken from '../../../docs/proof/ios-borgdock-review/setup-github-token.png';
import setupAzureDevops from '../../../docs/proof/ios-borgdock-review/setup-azure-devops.png';
import setupRepositories from '../../../docs/proof/ios-borgdock-review/setup-repositories.png';
import settings from '../../../docs/proof/ios-borgdock-review/settings.png';
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
import merge from '../../../docs/proof/ios-borgdock-review/bypass-merge.png';
import confirmMerge from '../../../docs/proof/ios-borgdock-review/bypass-merge-confirm.png';

import companionFocus from '../assets/iphone/focus.png';
import companionWork from '../assets/iphone/work.png';
import companionSprint from '../assets/iphone/sprint.png';
import companionSearch from '../assets/iphone/search.png';
import companionActivity from '../assets/iphone/activity.png';
import companionNotes from '../assets/iphone/notes.png';
import companionCapture from '../assets/iphone/capture.png';
import companionItem from '../assets/iphone/item.png';
import companionSources from '../assets/iphone/sources.png';
import type { Theme } from './media';

export const phoneScreens = {
  'pull-requests-home': { image: pullRequestsHome, title: 'Pull requests across watched repositories', theme: 'light' },
  'pull-requests-display': { image: pullRequestsDisplay, title: 'Display and grouping options', theme: 'light' },
  'pull-request': { image: pullRequest, title: 'Pull request checks and linked work', theme: 'light' },
  'pull-request-reviewers': { image: pullRequestReviewers, title: 'Reviewers and their decisions', theme: 'light' },
  'work-item': { image: workItem, title: 'Linked Azure DevOps work item', theme: 'light' },
  'work-item-details': { image: workItemDetails, title: 'Work item fields and links', theme: 'light' },
  'work-item-dark': { image: workItemDark, title: 'Work item in dark mode', theme: 'dark' },
  'review-brief': { image: reviewBrief, title: 'Review brief before opening the files', theme: 'light' },
  'review-walk': { image: reviewWalk, title: 'File walk with a unified diff', theme: 'light' },
  'review-comment-lines': { image: reviewCommentLines, title: 'Draft comment on a range of lines', theme: 'light' },
  'review-rereview': { image: reviewRereview, title: 'Changes since your last review', theme: 'light' },
  'review-decide': { image: reviewDecide, title: 'Review decision and auto-merge', theme: 'light' },
  'merge': { image: merge, title: 'Merge methods and branch protections', theme: 'light' },
  'confirm-merge': { image: confirmMerge, title: 'Confirm a bypass merge', theme: 'light' },
  'review-end': { image: reviewEnd, title: 'Completed review and the next pull request', theme: 'light' },
  'connect': { image: connect, title: 'Connect BorgDock Review', theme: 'light' },
  'setup-github-token': { image: setupGithubToken, title: 'Add a GitHub account', theme: 'light' },
  'setup-azure-devops': { image: setupAzureDevops, title: 'Connect an Azure DevOps project', theme: 'light' },
  'setup-repositories': { image: setupRepositories, title: 'Choose which repositories to watch', theme: 'light' },
  'settings': { image: settings, title: 'Account and refresh settings', theme: 'light' },
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
  'companion-activity': { image: companionActivity, title: 'Activity since you left your desk', theme: 'light' },
  'companion-notes': { image: companionNotes, title: 'Shared Markdown vault and recent notes', theme: 'light' },
  'companion-capture': { image: companionCapture, title: 'Quick capture linked to a pull request', theme: 'light' },
  'companion-item': { image: companionItem, title: 'Work item activity and agent actions', theme: 'light' },
  'companion-sources': { image: companionSources, title: 'Connected sources and agent machines', theme: 'light' },
} satisfies Record<string, { image: ImageMetadata; title: string; theme: Theme }>;
