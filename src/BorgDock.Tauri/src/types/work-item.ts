export interface WorkItem {
  id: number;
  rev: number;
  url: string;
  fields: Record<string, unknown>;
  relations: WorkItemRelation[];
  htmlUrl: string;
}

export interface WorkItemRelation {
  rel: string;
  url: string;
  attributes: Record<string, unknown>;
}

export interface WorkItemAttachment {
  id: string;
  fileName: string;
  size: number;
  url: string;
}

export interface AdoQuery {
  id: string;
  name: string;
  path: string;
  isFolder: boolean;
  hasChildren: boolean;
  children: AdoQuery[];
}

export interface AdoQueryResult {
  queryType: string;
  workItems: AdoQueryWorkItemRef[];
}

export interface AdoQueryWorkItemRef {
  id: number;
  url: string;
}

export type FieldSection = 'richText' | 'standard' | 'path' | 'dates' | 'custom';

export interface DynamicFieldItem {
  fieldKey: string;
  label: string;
  value?: string;
  isHtml: boolean;
  htmlContent?: string;
  section: FieldSection;
}

export interface JsonPatchOperation {
  op: string;
  path: string;
  value?: unknown;
}

export interface WorkItemComment {
  id: number;
  text: string;
  createdBy: {
    displayName: string;
    uniqueName?: string;
  };
  createdDate: string;
  modifiedDate: string;
}
