import type * as G from '@/generated/commands';

/**
 * The CI failure store's types as the frontend uses them. The generated
 * names are unions of the shapes Rust serializes and deserializes; what
 * comes back from a command is the serialized shape, with every field
 * present, and that shape is also a valid input.
 */
export type Signal = G.Signal_Serialize;
export type SignalKind = G.SignalKind;
export type JobLogEvidence = G.JobLogEvidence_Serialize;
export type CiOccurrence = G.CiOccurrence_Serialize;
export type CiSignalRow = G.CiSignalRow_Serialize;
export type CiOutcome = G.CiOutcome_Serialize;
export type CiOccurrenceDetail = G.CiOccurrenceDetail_Serialize;
export type CiGroupSummary = G.CiGroupSummary_Serialize;
export type CiGroupDetail = G.CiGroupDetail_Serialize;
export type CiCandidateView = G.CiCandidateView_Serialize;
export type CiClaim = G.CiClaim_Serialize;
export type CiClaimEvent = G.CiClaimEvent_Serialize;
export type CiClaimResult = G.CiClaimResult_Serialize;
export type CiDecision = G.CiDecision_Serialize;
export type CiPrFailures = G.CiPrFailures_Serialize;
export type CiScopeSnapshot = G.CiScopeSnapshot_Serialize;
export type CiKnownOccurrence = G.CiKnownOccurrence_Serialize;
export type CiBranchWatch = G.CiBranchWatch_Serialize;
export type CiRecordBatch = G.CiRecordBatch_Serialize;
export type CiFingerprintRow = G.CiFingerprintRow;
export type CiStoreInfo = G.CiStoreInfo;
/** Absent leaves a field as it is; null clears it. */
export type CiGroupPatch = G.CiGroupPatch_Deserialize;
export type CiClaimPatch = G.CiClaimPatch_Deserialize;
export type CiClaimOwner = G.CiClaimOwner_Deserialize;
