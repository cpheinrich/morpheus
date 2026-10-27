import { z } from "zod";
import { type CdConfig, type CdState } from "./schema.js";
import { type GitHubApi, type Transaction } from "./store.js";
declare const grantSchema: any;
declare const requestSchema: any;
export interface ReviewedSourceInput {
    grant: unknown;
    approvedGrantDigest: string;
    request: unknown;
    reservationId: string;
    maximumMicros: number;
}
export type ReviewedSourceGrant = z.infer<typeof grantSchema>;
export type SourcePublicationRequest = z.infer<typeof requestSchema>;
export interface ReviewedSourceEnvelope {
    readonly version: 1;
    readonly kind: "reviewed-source-reservation";
    readonly request: Readonly<SourcePublicationRequest>;
    readonly authority: {
        readonly grant: Readonly<ReviewedSourceGrant>;
        readonly digest: string;
    };
}
export interface ReviewedSourceReceipt {
    readonly version: 1;
    readonly kind: "reviewed-source-reservation-receipt";
    readonly id: string;
    readonly maximumMicros: number;
    readonly requestDigest: string;
    readonly envelope: ReviewedSourceEnvelope;
}
export interface PreparedReviewedSourceReservation {
    readonly config: CdConfig;
    readonly grant: Readonly<ReviewedSourceGrant>;
    readonly request: Readonly<SourcePublicationRequest>;
    readonly approvedGrantDigest: string;
    readonly reservationId: string;
    readonly maximumMicros: number;
    readonly receipt: ReviewedSourceReceipt;
    readonly transitionId: string;
}
export declare function prepareReviewedSourceReservation(config: CdConfig, input: ReviewedSourceInput): PreparedReviewedSourceReservation;
type Prepared = PreparedReviewedSourceReservation;
/** Pure CAS callback seam; an observation time is data, never a CLI clock override. */
export declare function applyReviewedSourceReservation(state: CdState, prepared: Prepared, observedAt: string): ReviewedSourceReceipt;
/** The hash pins an operator-reviewed input; it is not a human signature or a credential. */
export declare function reserveReviewedSource(api: GitHubApi, config: CdConfig, input: ReviewedSourceInput): Promise<Transaction<ReviewedSourceReceipt> & {
    verifiedReadbackHead: string;
}>;
export {};
