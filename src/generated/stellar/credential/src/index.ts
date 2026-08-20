import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}




export const ContractError = {
  1: {message:"Unauthorized"},
  2: {message:"InvalidInput"},
  3: {message:"AlreadyExists"},
  4: {message:"NotFound"},
  6: {message:"AlreadyRevoked"},
  7: {message:"UnsupportedHashSchema"},
  8: {message:"TokenIdOverflow"},
  9: {message:"IssuerOperatorNotLinked"},
  10: {message:"UnknownCredentialType"}
}


export interface CredentialRecord {
  credential_id: Buffer;
  credential_type: u32;
  event_id: Buffer;
  hash_schema: u32;
  issued_by: string;
  issued_ledger: u32;
  issuer_id: Buffer;
  metadata_hash: Buffer;
  revoked: boolean;
  revoked_ledger: Option<u32>;
  revoked_reason_hash: Option<Buffer>;
  subject_id: Buffer;
  token_id: u64;
}





export const RoleTransferError = {
  2200: {message:"NoPendingTransfer"},
  2201: {message:"InvalidLiveUntilLedger"},
  2202: {message:"InvalidPendingAccount"},
  2203: {message:"TransferExpired"}
}



export const AccessControlError = {
  2000: {message:"Unauthorized"},
  2001: {message:"AdminNotSet"},
  2002: {message:"IndexOutOfBounds"},
  2003: {message:"AdminRoleNotFound"},
  2004: {message:"RoleCountIsNotZero"},
  2005: {message:"RoleNotFound"},
  2006: {message:"AdminAlreadySet"},
  2007: {message:"RoleNotHeld"},
  2008: {message:"RoleIsEmpty"},
  2009: {message:"TransferInProgress"},
  2010: {message:"MaxRolesExceeded"}
}



export interface Client {
  /**
   * Construct and simulate a grant_issuer transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  grant_issuer: ({caller, account}: {caller: string, account: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a grant_revoker transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  grant_revoker: ({caller, account}: {caller: string, account: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a revoke_issuer transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  revoke_issuer: ({caller, account}: {caller: string, account: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_credential transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_credential: ({credential_id}: {credential_id: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Option<CredentialRecord>>>

  /**
   * Construct and simulate a revoke_revoker transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  revoke_revoker: ({caller, account}: {caller: string, account: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a transfer_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Transferencia administrativa en dos pasos con expiración en ledger.
   */
  transfer_admin: ({new_admin, live_until_ledger}: {new_admin: string, live_until_ledger: u32}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a issue_credential transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Emite una atestación. Idempotente por clave de negocio: repetir con
   * los mismos campos devuelve el `token_id` original sin escribir ni
   * emitir evento; con diferencias devuelve `AlreadyExists`.
   */
  issue_credential: ({operator, credential_id, issuer_id, subject_id, event_id, credential_type, metadata_hash, hash_schema}: {operator: string, credential_id: Buffer, issuer_id: Buffer, subject_id: Buffer, event_id: Buffer, credential_type: u32, metadata_hash: Buffer, hash_schema: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u64>>>

  /**
   * Construct and simulate a allow_hash_schema transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  allow_hash_schema: ({hash_schema}: {hash_schema: u32}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a revoke_credential transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Revoca preservando el registro. Idempotente con la misma razón; una
   * razón distinta devuelve `AlreadyRevoked`. No afecta otras credenciales.
   */
  revoke_credential: ({operator, credential_id, reason_hash}: {operator: string, credential_id: Buffer, reason_hash: Option<Buffer>}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a verify_credential transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Verificación pública completa: existe, coincide hash/esquema y no
   * está revocada.
   */
  verify_credential: ({credential_id, metadata_hash, hash_schema}: {credential_id: Buffer, metadata_hash: Buffer, hash_schema: u32}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a is_issuer_operator transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  is_issuer_operator: ({issuer_id, operator}: {issuer_id: Buffer, operator: string}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a link_issuer_operator transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Vincula un operador a un emisor institucional. Idempotente.
   */
  link_issuer_operator: ({issuer_id, operator}: {issuer_id: Buffer, operator: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a accept_admin_transfer transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  accept_admin_transfer: (options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a unlink_issuer_operator transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Desvincula un operador de un emisor. Idempotente.
   */
  unlink_issuer_operator: ({issuer_id, operator}: {issuer_id: Buffer, operator: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_credential_by_token_id transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_credential_by_token_id: ({token_id}: {token_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Option<CredentialRecord>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {admin, issuer, revoker, hash_schema}: {admin: string, issuer: string, revoker: string, hash_schema: u32},
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({admin, issuer, revoker, hash_schema}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAADUNvbnRyYWN0RXJyb3IAAAAAAAAJAAAAAAAAAAxVbmF1dGhvcml6ZWQAAAABAAAAAAAAAAxJbnZhbGlkSW5wdXQAAAACAAAAAAAAAA1BbHJlYWR5RXhpc3RzAAAAAAAAAwAAAAAAAAAITm90Rm91bmQAAAAEAAAAAAAAAA5BbHJlYWR5UmV2b2tlZAAAAAAABgAAAAAAAAAVVW5zdXBwb3J0ZWRIYXNoU2NoZW1hAAAAAAAABwAAAAAAAAAPVG9rZW5JZE92ZXJmbG93AAAAAAgAAAAAAAAAF0lzc3Vlck9wZXJhdG9yTm90TGlua2VkAAAAAAkAAAAAAAAAFVVua25vd25DcmVkZW50aWFsVHlwZQAAAAAAAAo=",
        "AAAAAQAAAAAAAAAAAAAAEENyZWRlbnRpYWxSZWNvcmQAAAANAAAAAAAAAA1jcmVkZW50aWFsX2lkAAAAAAAD7gAAACAAAAAAAAAAD2NyZWRlbnRpYWxfdHlwZQAAAAAEAAAAAAAAAAhldmVudF9pZAAAA+4AAAAgAAAAAAAAAAtoYXNoX3NjaGVtYQAAAAAEAAAAAAAAAAlpc3N1ZWRfYnkAAAAAAAATAAAAAAAAAA1pc3N1ZWRfbGVkZ2VyAAAAAAAABAAAAAAAAAAJaXNzdWVyX2lkAAAAAAAD7gAAACAAAAAAAAAADW1ldGFkYXRhX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAAHcmV2b2tlZAAAAAABAAAAAAAAAA5yZXZva2VkX2xlZGdlcgAAAAAD6AAAAAQAAAAAAAAAE3Jldm9rZWRfcmVhc29uX2hhc2gAAAAD6AAAA+4AAAAgAAAAAAAAAApzdWJqZWN0X2lkAAAAAAPuAAAAIAAAAAAAAAAIdG9rZW5faWQAAAAG",
        "AAAABQAAAAAAAAAAAAAAEENyZWRlbnRpYWxJc3N1ZWQAAAABAAAAEWNyZWRlbnRpYWxfaXNzdWVkAAAAAAAACgAAAAAAAAANY3JlZGVudGlhbF9pZAAAAAAAA+4AAAAgAAAAAQAAAAAAAAAIdG9rZW5faWQAAAAGAAAAAQAAAAAAAAAJaXNzdWVyX2lkAAAAAAAD7gAAACAAAAAAAAAAAAAAAAlpc3N1ZWRfYnkAAAAAAAATAAAAAAAAAAAAAAAKc3ViamVjdF9pZAAAAAAD7gAAACAAAAAAAAAAAAAAAAhldmVudF9pZAAAA+4AAAAgAAAAAAAAAAAAAAAPY3JlZGVudGlhbF90eXBlAAAAAAQAAAAAAAAAAAAAAA1tZXRhZGF0YV9oYXNoAAAAAAAD7gAAACAAAAAAAAAAAAAAAAtoYXNoX3NjaGVtYQAAAAAEAAAAAAAAAAAAAAANaXNzdWVkX2xlZGdlcgAAAAAAAAQAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAAEUNyZWRlbnRpYWxSZXZva2VkAAAAAAAAAQAAABJjcmVkZW50aWFsX3Jldm9rZWQAAAAAAAUAAAAAAAAADWNyZWRlbnRpYWxfaWQAAAAAAAPuAAAAIAAAAAEAAAAAAAAACHRva2VuX2lkAAAABgAAAAEAAAAAAAAAB3Jldm9rZXIAAAAAEwAAAAAAAAAAAAAAC3JlYXNvbl9oYXNoAAAAA+gAAAPuAAAAIAAAAAAAAAAAAAAADnJldm9rZWRfbGVkZ2VyAAAAAAAEAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAAFElzc3Vlck9wZXJhdG9yTGlua2VkAAAAAQAAABZpc3N1ZXJfb3BlcmF0b3JfbGlua2VkAAAAAAACAAAAAAAAAAlpc3N1ZXJfaWQAAAAAAAPuAAAAIAAAAAEAAAAAAAAACG9wZXJhdG9yAAAAEwAAAAEAAAAC",
        "AAAABQAAAAAAAAAAAAAAFklzc3Vlck9wZXJhdG9yVW5saW5rZWQAAAAAAAEAAAAYaXNzdWVyX29wZXJhdG9yX3VubGlua2VkAAAAAgAAAAAAAAAJaXNzdWVyX2lkAAAAAAAD7gAAACAAAAABAAAAAAAAAAhvcGVyYXRvcgAAABMAAAABAAAAAg==",
        "AAAAAAAAAAAAAAAMZ3JhbnRfaXNzdWVyAAAAAgAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAAAAAAdhY2NvdW50AAAAABMAAAAA",
        "AAAAAAAAAGhDb25zdHJ1Y3RvciDDum5pY28sIHNvbG8gYWwgZGVzcGxlZ2FyLiBJbmljaWFsaXphIGFkbWluLCByb2xlcwppc3N1ZXIvcmV2b2tlciB5IGVzcXVlbWEgZGUgaGFzaCBpbmljaWFsLgAAAA1fX2NvbnN0cnVjdG9yAAAAAAAABAAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAZpc3N1ZXIAAAAAABMAAAAAAAAAB3Jldm9rZXIAAAAAEwAAAAAAAAALaGFzaF9zY2hlbWEAAAAABAAAAAA=",
        "AAAAAAAAAAAAAAANZ3JhbnRfcmV2b2tlcgAAAAAAAAIAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAAAAAAHYWNjb3VudAAAAAATAAAAAA==",
        "AAAAAAAAAAAAAAANcmV2b2tlX2lzc3VlcgAAAAAAAAIAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAAAAAAHYWNjb3VudAAAAAATAAAAAA==",
        "AAAAAAAAAAAAAAAOZ2V0X2NyZWRlbnRpYWwAAAAAAAEAAAAAAAAADWNyZWRlbnRpYWxfaWQAAAAAAAPuAAAAIAAAAAEAAAPoAAAH0AAAABBDcmVkZW50aWFsUmVjb3Jk",
        "AAAAAAAAAAAAAAAOcmV2b2tlX3Jldm9rZXIAAAAAAAIAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAAAAAAHYWNjb3VudAAAAAATAAAAAA==",
        "AAAAAAAAAERUcmFuc2ZlcmVuY2lhIGFkbWluaXN0cmF0aXZhIGVuIGRvcyBwYXNvcyBjb24gZXhwaXJhY2nDs24gZW4gbGVkZ2VyLgAAAA50cmFuc2Zlcl9hZG1pbgAAAAAAAgAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAAAAAARbGl2ZV91bnRpbF9sZWRnZXIAAAAAAAAEAAAAAA==",
        "AAAAAAAAAL9FbWl0ZSB1bmEgYXRlc3RhY2nDs24uIElkZW1wb3RlbnRlIHBvciBjbGF2ZSBkZSBuZWdvY2lvOiByZXBldGlyIGNvbgpsb3MgbWlzbW9zIGNhbXBvcyBkZXZ1ZWx2ZSBlbCBgdG9rZW5faWRgIG9yaWdpbmFsIHNpbiBlc2NyaWJpciBuaQplbWl0aXIgZXZlbnRvOyBjb24gZGlmZXJlbmNpYXMgZGV2dWVsdmUgYEFscmVhZHlFeGlzdHNgLgAAAAAQaXNzdWVfY3JlZGVudGlhbAAAAAgAAAAAAAAACG9wZXJhdG9yAAAAEwAAAAAAAAANY3JlZGVudGlhbF9pZAAAAAAAA+4AAAAgAAAAAAAAAAlpc3N1ZXJfaWQAAAAAAAPuAAAAIAAAAAAAAAAKc3ViamVjdF9pZAAAAAAD7gAAACAAAAAAAAAACGV2ZW50X2lkAAAD7gAAACAAAAAAAAAAD2NyZWRlbnRpYWxfdHlwZQAAAAAEAAAAAAAAAA1tZXRhZGF0YV9oYXNoAAAAAAAD7gAAACAAAAAAAAAAC2hhc2hfc2NoZW1hAAAAAAQAAAABAAAD6QAAAAYAAAfQAAAADUNvbnRyYWN0RXJyb3IAAAA=",
        "AAAAAAAAAAAAAAARYWxsb3dfaGFzaF9zY2hlbWEAAAAAAAABAAAAAAAAAAtoYXNoX3NjaGVtYQAAAAAEAAAAAA==",
        "AAAAAAAAAI1SZXZvY2EgcHJlc2VydmFuZG8gZWwgcmVnaXN0cm8uIElkZW1wb3RlbnRlIGNvbiBsYSBtaXNtYSByYXrDs247IHVuYQpyYXrDs24gZGlzdGludGEgZGV2dWVsdmUgYEFscmVhZHlSZXZva2VkYC4gTm8gYWZlY3RhIG90cmFzIGNyZWRlbmNpYWxlcy4AAAAAAAARcmV2b2tlX2NyZWRlbnRpYWwAAAAAAAADAAAAAAAAAAhvcGVyYXRvcgAAABMAAAAAAAAADWNyZWRlbnRpYWxfaWQAAAAAAAPuAAAAIAAAAAAAAAALcmVhc29uX2hhc2gAAAAD6AAAA+4AAAAgAAAAAQAAA+kAAAACAAAH0AAAAA1Db250cmFjdEVycm9yAAAA",
        "AAAAAAAAAFNWZXJpZmljYWNpw7NuIHDDumJsaWNhIGNvbXBsZXRhOiBleGlzdGUsIGNvaW5jaWRlIGhhc2gvZXNxdWVtYSB5IG5vCmVzdMOhIHJldm9jYWRhLgAAAAARdmVyaWZ5X2NyZWRlbnRpYWwAAAAAAAADAAAAAAAAAA1jcmVkZW50aWFsX2lkAAAAAAAD7gAAACAAAAAAAAAADW1ldGFkYXRhX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAALaGFzaF9zY2hlbWEAAAAABAAAAAEAAAAB",
        "AAAAAAAAAAAAAAASaXNfaXNzdWVyX29wZXJhdG9yAAAAAAACAAAAAAAAAAlpc3N1ZXJfaWQAAAAAAAPuAAAAIAAAAAAAAAAIb3BlcmF0b3IAAAATAAAAAQAAAAE=",
        "AAAAAAAAADtWaW5jdWxhIHVuIG9wZXJhZG9yIGEgdW4gZW1pc29yIGluc3RpdHVjaW9uYWwuIElkZW1wb3RlbnRlLgAAAAAUbGlua19pc3N1ZXJfb3BlcmF0b3IAAAACAAAAAAAAAAlpc3N1ZXJfaWQAAAAAAAPuAAAAIAAAAAAAAAAIb3BlcmF0b3IAAAATAAAAAA==",
        "AAAAAAAAAAAAAAAVYWNjZXB0X2FkbWluX3RyYW5zZmVyAAAAAAAAAAAAAAA=",
        "AAAAAAAAADFEZXN2aW5jdWxhIHVuIG9wZXJhZG9yIGRlIHVuIGVtaXNvci4gSWRlbXBvdGVudGUuAAAAAAAAFnVubGlua19pc3N1ZXJfb3BlcmF0b3IAAAAAAAIAAAAAAAAACWlzc3Vlcl9pZAAAAAAAA+4AAAAgAAAAAAAAAAhvcGVyYXRvcgAAABMAAAAA",
        "AAAAAAAAAAAAAAAaZ2V0X2NyZWRlbnRpYWxfYnlfdG9rZW5faWQAAAAAAAEAAAAAAAAACHRva2VuX2lkAAAABgAAAAEAAAPoAAAH0AAAABBDcmVkZW50aWFsUmVjb3Jk",
        "AAAABAAAAAAAAAAAAAAAEVJvbGVUcmFuc2ZlckVycm9yAAAAAAAABAAAAAAAAAARTm9QZW5kaW5nVHJhbnNmZXIAAAAAAAiYAAAAAAAAABZJbnZhbGlkTGl2ZVVudGlsTGVkZ2VyAAAAAAiZAAAAAAAAABVJbnZhbGlkUGVuZGluZ0FjY291bnQAAAAAAAiaAAAAAAAAAA9UcmFuc2ZlckV4cGlyZWQAAAAImw==",
        "AAAABQAAACVFdmVudCBlbWl0dGVkIHdoZW4gYSByb2xlIGlzIGdyYW50ZWQuAAAAAAAAAAAAAAtSb2xlR3JhbnRlZAAAAAABAAAADHJvbGVfZ3JhbnRlZAAAAAMAAAAAAAAABHJvbGUAAAARAAAAAQAAAAAAAAAHYWNjb3VudAAAAAATAAAAAQAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAAAAAAI=",
        "AAAABQAAACVFdmVudCBlbWl0dGVkIHdoZW4gYSByb2xlIGlzIHJldm9rZWQuAAAAAAAAAAAAAAtSb2xlUmV2b2tlZAAAAAABAAAADHJvbGVfcmV2b2tlZAAAAAMAAAAAAAAABHJvbGUAAAARAAAAAQAAAAAAAAAHYWNjb3VudAAAAAATAAAAAQAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAAAAAAI=",
        "AAAABAAAAAAAAAAAAAAAEkFjY2Vzc0NvbnRyb2xFcnJvcgAAAAAACwAAAAAAAAAMVW5hdXRob3JpemVkAAAH0AAAAAAAAAALQWRtaW5Ob3RTZXQAAAAH0QAAAAAAAAAQSW5kZXhPdXRPZkJvdW5kcwAAB9IAAAAAAAAAEUFkbWluUm9sZU5vdEZvdW5kAAAAAAAH0wAAAAAAAAASUm9sZUNvdW50SXNOb3RaZXJvAAAAAAfUAAAAAAAAAAxSb2xlTm90Rm91bmQAAAfVAAAAAAAAAA9BZG1pbkFscmVhZHlTZXQAAAAH1gAAAAAAAAALUm9sZU5vdEhlbGQAAAAH1wAAAAAAAAALUm9sZUlzRW1wdHkAAAAH2AAAAAAAAAASVHJhbnNmZXJJblByb2dyZXNzAAAAAAfZAAAAAAAAABBNYXhSb2xlc0V4Y2VlZGVkAAAH2g==",
        "AAAABQAAADJFdmVudCBlbWl0dGVkIHdoZW4gYW4gYWRtaW4gdHJhbnNmZXIgaXMgY29tcGxldGVkLgAAAAAAAAAAABZBZG1pblRyYW5zZmVyQ29tcGxldGVkAAAAAAABAAAAGGFkbWluX3RyYW5zZmVyX2NvbXBsZXRlZAAAAAIAAAAAAAAACW5ld19hZG1pbgAAAAAAABMAAAABAAAAAAAAAA5wcmV2aW91c19hZG1pbgAAAAAAEwAAAAAAAAAC",
        "AAAABQAAADJFdmVudCBlbWl0dGVkIHdoZW4gYW4gYWRtaW4gdHJhbnNmZXIgaXMgaW5pdGlhdGVkLgAAAAAAAAAAABZBZG1pblRyYW5zZmVySW5pdGlhdGVkAAAAAAABAAAAGGFkbWluX3RyYW5zZmVyX2luaXRpYXRlZAAAAAMAAAAAAAAADWN1cnJlbnRfYWRtaW4AAAAAAAATAAAAAQAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAAAAAAAAAAAEWxpdmVfdW50aWxfbGVkZ2VyAAAAAAAABAAAAAAAAAAC" ]),
      options
    )
  }
  public readonly fromJSON = {
    grant_issuer: this.txFromJSON<null>,
        grant_revoker: this.txFromJSON<null>,
        revoke_issuer: this.txFromJSON<null>,
        get_credential: this.txFromJSON<Option<CredentialRecord>>,
        revoke_revoker: this.txFromJSON<null>,
        transfer_admin: this.txFromJSON<null>,
        issue_credential: this.txFromJSON<Result<u64>>,
        allow_hash_schema: this.txFromJSON<null>,
        revoke_credential: this.txFromJSON<Result<void>>,
        verify_credential: this.txFromJSON<boolean>,
        is_issuer_operator: this.txFromJSON<boolean>,
        link_issuer_operator: this.txFromJSON<null>,
        accept_admin_transfer: this.txFromJSON<null>,
        unlink_issuer_operator: this.txFromJSON<null>,
        get_credential_by_token_id: this.txFromJSON<Option<CredentialRecord>>
  }
}