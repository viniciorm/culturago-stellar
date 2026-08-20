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





export interface EntityHead {
  active: boolean;
  latest_version: u32;
  updated_ledger: u32;
}

export const ContractError = {
  1: {message:"Unauthorized"},
  2: {message:"InvalidInput"},
  3: {message:"AlreadyExists"},
  4: {message:"NotFound"},
  5: {message:"Inactive"},
  6: {message:"VersionConflict"},
  7: {message:"UnsupportedHashSchema"}
}


export interface EntityVersion {
  hash_schema: u32;
  metadata_hash: Buffer;
  recorded_ledger: u32;
  registrar: string;
  version: u32;
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
   * Construct and simulate a get_entity transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_entity: ({entity_id}: {entity_id: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Option<EntityHead>>>

  /**
   * Construct and simulate a verify_entity transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Verificación pública: existe la versión, coincide hash/esquema y la
   * cabeza está activa.
   */
  verify_entity: ({entity_id, version, metadata_hash, hash_schema}: {entity_id: Buffer, version: u32, metadata_hash: Buffer, hash_schema: u32}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a transfer_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Transferencia administrativa en dos pasos con expiración en ledger.
   */
  transfer_admin: ({new_admin, live_until_ledger}: {new_admin: string, live_until_ledger: u32}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a version_entity transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Crea una nueva versión con control optimista; nunca sobrescribe.
   */
  version_entity: ({operator, entity_id, expected_version, metadata_hash, hash_schema}: {operator: string, entity_id: Buffer, expected_version: u32, metadata_hash: Buffer, hash_schema: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u32>>>

  /**
   * Construct and simulate a grant_registrar transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  grant_registrar: ({caller, account}: {caller: string, account: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a register_entity transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Registra la versión 1 de una entidad. Idempotente: repetir con el
   * mismo hash/esquema devuelve 1 sin escribir ni emitir evento.
   */
  register_entity: ({operator, entity_id, metadata_hash, hash_schema}: {operator: string, entity_id: Buffer, metadata_hash: Buffer, hash_schema: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u32>>>

  /**
   * Construct and simulate a revoke_registrar transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  revoke_registrar: ({caller, account}: {caller: string, account: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a allow_hash_schema transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  allow_hash_schema: ({hash_schema}: {hash_schema: u32}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a deactivate_entity transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Desactiva la entidad sin borrar versiones. Idempotente si ya está
   * inactiva y coincide `expected_version`.
   */
  deactivate_entity: ({operator, entity_id, expected_version, reason_hash}: {operator: string, entity_id: Buffer, expected_version: u32, reason_hash: Option<Buffer>}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_entity_version transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_entity_version: ({entity_id, version}: {entity_id: Buffer, version: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Option<EntityVersion>>>

  /**
   * Construct and simulate a accept_admin_transfer transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  accept_admin_transfer: (options?: MethodOptions) => Promise<AssembledTransaction<null>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {admin, registrar, hash_schema}: {admin: string, registrar: string, hash_schema: u32},
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
    return ContractClient.deploy({admin, registrar, hash_schema}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAQAAAAAAAAAAAAAACkVudGl0eUhlYWQAAAAAAAMAAAAAAAAABmFjdGl2ZQAAAAAAAQAAAAAAAAAObGF0ZXN0X3ZlcnNpb24AAAAAAAQAAAAAAAAADnVwZGF0ZWRfbGVkZ2VyAAAAAAAE",
        "AAAABAAAAAAAAAAAAAAADUNvbnRyYWN0RXJyb3IAAAAAAAAHAAAAAAAAAAxVbmF1dGhvcml6ZWQAAAABAAAAAAAAAAxJbnZhbGlkSW5wdXQAAAACAAAAAAAAAA1BbHJlYWR5RXhpc3RzAAAAAAAAAwAAAAAAAAAITm90Rm91bmQAAAAEAAAAAAAAAAhJbmFjdGl2ZQAAAAUAAAAAAAAAD1ZlcnNpb25Db25mbGljdAAAAAAGAAAAAAAAABVVbnN1cHBvcnRlZEhhc2hTY2hlbWEAAAAAAAAH",
        "AAAAAQAAAAAAAAAAAAAADUVudGl0eVZlcnNpb24AAAAAAAAFAAAAAAAAAAtoYXNoX3NjaGVtYQAAAAAEAAAAAAAAAA1tZXRhZGF0YV9oYXNoAAAAAAAD7gAAACAAAAAAAAAAD3JlY29yZGVkX2xlZGdlcgAAAAAEAAAAAAAAAAlyZWdpc3RyYXIAAAAAAAATAAAAAAAAAAd2ZXJzaW9uAAAAAAQ=",
        "AAAABQAAAAAAAAAAAAAAD0VudGl0eVZlcnNpb25lZAAAAAABAAAAEGVudGl0eV92ZXJzaW9uZWQAAAAGAAAAAAAAAAllbnRpdHlfaWQAAAAAAAPuAAAAIAAAAAEAAAAAAAAAB3ZlcnNpb24AAAAABAAAAAEAAAAAAAAADW1ldGFkYXRhX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAAAAAAAC2hhc2hfc2NoZW1hAAAAAAQAAAAAAAAAAAAAAAlyZWdpc3RyYXIAAAAAAAATAAAAAAAAAAAAAAAPcmVjb3JkZWRfbGVkZ2VyAAAAAAQAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAAEEVudGl0eVJlZ2lzdGVyZWQAAAABAAAAEWVudGl0eV9yZWdpc3RlcmVkAAAAAAAABgAAAAAAAAAJZW50aXR5X2lkAAAAAAAD7gAAACAAAAABAAAAAAAAAAd2ZXJzaW9uAAAAAAQAAAABAAAAAAAAAA1tZXRhZGF0YV9oYXNoAAAAAAAD7gAAACAAAAAAAAAAAAAAAAtoYXNoX3NjaGVtYQAAAAAEAAAAAAAAAAAAAAAJcmVnaXN0cmFyAAAAAAAAEwAAAAAAAAAAAAAAD3JlY29yZGVkX2xlZGdlcgAAAAAEAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAAEUVudGl0eURlYWN0aXZhdGVkAAAAAAAAAQAAABJlbnRpdHlfZGVhY3RpdmF0ZWQAAAAAAAUAAAAAAAAACWVudGl0eV9pZAAAAAAAA+4AAAAgAAAAAQAAAAAAAAAHdmVyc2lvbgAAAAAEAAAAAQAAAAAAAAAIb3BlcmF0b3IAAAATAAAAAAAAAAAAAAALcmVhc29uX2hhc2gAAAAD6AAAA+4AAAAgAAAAAAAAAAAAAAAPcmVjb3JkZWRfbGVkZ2VyAAAAAAQAAAAAAAAAAg==",
        "AAAAAAAAAAAAAAAKZ2V0X2VudGl0eQAAAAAAAQAAAAAAAAAJZW50aXR5X2lkAAAAAAAD7gAAACAAAAABAAAD6AAAB9AAAAAKRW50aXR5SGVhZAAA",
        "AAAAAAAAAHtDb25zdHJ1Y3RvciDDum5pY28sIHNvbG8gYWwgZGVzcGxlZ2FyLiBJbmljaWFsaXphIGFkbWluLCByb2wgcmVnaXN0cmFyCnkgZWwgY29uanVudG8gaW5pY2lhbCBkZSBlc3F1ZW1hcyBkZSBoYXNoIGFkbWl0aWRvcy4AAAAADV9fY29uc3RydWN0b3IAAAAAAAADAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAACXJlZ2lzdHJhcgAAAAAAABMAAAAAAAAAC2hhc2hfc2NoZW1hAAAAAAQAAAAA",
        "AAAAAAAAAFtWZXJpZmljYWNpw7NuIHDDumJsaWNhOiBleGlzdGUgbGEgdmVyc2nDs24sIGNvaW5jaWRlIGhhc2gvZXNxdWVtYSB5IGxhCmNhYmV6YSBlc3TDoSBhY3RpdmEuAAAAAA12ZXJpZnlfZW50aXR5AAAAAAAABAAAAAAAAAAJZW50aXR5X2lkAAAAAAAD7gAAACAAAAAAAAAAB3ZlcnNpb24AAAAABAAAAAAAAAANbWV0YWRhdGFfaGFzaAAAAAAAA+4AAAAgAAAAAAAAAAtoYXNoX3NjaGVtYQAAAAAEAAAAAQAAAAE=",
        "AAAAAAAAAERUcmFuc2ZlcmVuY2lhIGFkbWluaXN0cmF0aXZhIGVuIGRvcyBwYXNvcyBjb24gZXhwaXJhY2nDs24gZW4gbGVkZ2VyLgAAAA50cmFuc2Zlcl9hZG1pbgAAAAAAAgAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAAAAAARbGl2ZV91bnRpbF9sZWRnZXIAAAAAAAAEAAAAAA==",
        "AAAAAAAAAEFDcmVhIHVuYSBudWV2YSB2ZXJzacOzbiBjb24gY29udHJvbCBvcHRpbWlzdGE7IG51bmNhIHNvYnJlc2NyaWJlLgAAAAAAAA52ZXJzaW9uX2VudGl0eQAAAAAABQAAAAAAAAAIb3BlcmF0b3IAAAATAAAAAAAAAAllbnRpdHlfaWQAAAAAAAPuAAAAIAAAAAAAAAAQZXhwZWN0ZWRfdmVyc2lvbgAAAAQAAAAAAAAADW1ldGFkYXRhX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAALaGFzaF9zY2hlbWEAAAAABAAAAAEAAAPpAAAABAAAB9AAAAANQ29udHJhY3RFcnJvcgAAAA==",
        "AAAAAAAAAAAAAAAPZ3JhbnRfcmVnaXN0cmFyAAAAAAIAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAAAAAAHYWNjb3VudAAAAAATAAAAAA==",
        "AAAAAAAAAH9SZWdpc3RyYSBsYSB2ZXJzacOzbiAxIGRlIHVuYSBlbnRpZGFkLiBJZGVtcG90ZW50ZTogcmVwZXRpciBjb24gZWwKbWlzbW8gaGFzaC9lc3F1ZW1hIGRldnVlbHZlIDEgc2luIGVzY3JpYmlyIG5pIGVtaXRpciBldmVudG8uAAAAAA9yZWdpc3Rlcl9lbnRpdHkAAAAABAAAAAAAAAAIb3BlcmF0b3IAAAATAAAAAAAAAAllbnRpdHlfaWQAAAAAAAPuAAAAIAAAAAAAAAANbWV0YWRhdGFfaGFzaAAAAAAAA+4AAAAgAAAAAAAAAAtoYXNoX3NjaGVtYQAAAAAEAAAAAQAAA+kAAAAEAAAH0AAAAA1Db250cmFjdEVycm9yAAAA",
        "AAAAAAAAAAAAAAAQcmV2b2tlX3JlZ2lzdHJhcgAAAAIAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAAAAAAHYWNjb3VudAAAAAATAAAAAA==",
        "AAAAAAAAAAAAAAARYWxsb3dfaGFzaF9zY2hlbWEAAAAAAAABAAAAAAAAAAtoYXNoX3NjaGVtYQAAAAAEAAAAAA==",
        "AAAAAAAAAGpEZXNhY3RpdmEgbGEgZW50aWRhZCBzaW4gYm9ycmFyIHZlcnNpb25lcy4gSWRlbXBvdGVudGUgc2kgeWEgZXN0w6EKaW5hY3RpdmEgeSBjb2luY2lkZSBgZXhwZWN0ZWRfdmVyc2lvbmAuAAAAAAARZGVhY3RpdmF0ZV9lbnRpdHkAAAAAAAAEAAAAAAAAAAhvcGVyYXRvcgAAABMAAAAAAAAACWVudGl0eV9pZAAAAAAAA+4AAAAgAAAAAAAAABBleHBlY3RlZF92ZXJzaW9uAAAABAAAAAAAAAALcmVhc29uX2hhc2gAAAAD6AAAA+4AAAAgAAAAAQAAA+kAAAACAAAH0AAAAA1Db250cmFjdEVycm9yAAAA",
        "AAAAAAAAAAAAAAASZ2V0X2VudGl0eV92ZXJzaW9uAAAAAAACAAAAAAAAAAllbnRpdHlfaWQAAAAAAAPuAAAAIAAAAAAAAAAHdmVyc2lvbgAAAAAEAAAAAQAAA+gAAAfQAAAADUVudGl0eVZlcnNpb24AAAA=",
        "AAAAAAAAAAAAAAAVYWNjZXB0X2FkbWluX3RyYW5zZmVyAAAAAAAAAAAAAAA=",
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
    get_entity: this.txFromJSON<Option<EntityHead>>,
        verify_entity: this.txFromJSON<boolean>,
        transfer_admin: this.txFromJSON<null>,
        version_entity: this.txFromJSON<Result<u32>>,
        grant_registrar: this.txFromJSON<null>,
        register_entity: this.txFromJSON<Result<u32>>,
        revoke_registrar: this.txFromJSON<null>,
        allow_hash_schema: this.txFromJSON<null>,
        deactivate_entity: this.txFromJSON<Result<void>>,
        get_entity_version: this.txFromJSON<Option<EntityVersion>>,
        accept_admin_transfer: this.txFromJSON<null>
  }
}