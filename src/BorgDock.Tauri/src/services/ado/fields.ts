import type { AdoClient } from './client';

export type AdoFieldType =
  | 'string'
  | 'integer'
  | 'double'
  | 'dateTime'
  | 'plainText'
  | 'html'
  | 'treePath'
  | 'history'
  | 'boolean'
  | 'guid'
  | 'identity'
  | 'picklistString'
  | 'picklistInteger'
  | 'picklistDouble';

export interface AdoFieldMeta {
  referenceName: string;
  name: string;
  type: AdoFieldType;
  readOnly: boolean;
}

interface AdoFieldsResponse {
  value: Array<{
    name: string;
    referenceName: string;
    type: string;
    readOnly?: boolean;
    usage?: string;
  }>;
}

export async function getProjectFields(client: AdoClient): Promise<AdoFieldMeta[]> {
  const response = await client.get<AdoFieldsResponse>('wit/fields');
  return (response.value ?? [])
    .filter((f) => (f.usage ?? 'workItem').toLowerCase().includes('workitem'))
    .map((f) => ({
      referenceName: f.referenceName,
      name: f.name,
      type: f.type as AdoFieldType,
      readOnly: !!f.readOnly,
    }));
}

export function indexFieldsByRef(fields: AdoFieldMeta[]): Map<string, AdoFieldMeta> {
  return new Map(fields.map((f) => [f.referenceName, f]));
}
