import { describe, expect, it, vi } from 'vitest';
import {
  Account,
  BASE_FEE,
  Keypair,
  Operation,
  SorobanDataBuilder,
  StrKey,
  Transaction,
  TransactionBuilder,
  rpc,
  xdr,
} from '@stellar/stellar-sdk';
import { SdkSorobanTransport } from '@/infrastructure/stellar/SdkSorobanTransport';
import type { StellarNetworkConfig } from '@/infrastructure/stellar/networkConfig';
import type { ContractCallSpec } from '@/ports/SorobanTransport';
import { isDomainError } from '@/domain/errors';

const networkPassphrase = 'Test SDF Network ; September 2015';
const INCLUSION_FEE = Number(BASE_FEE);

function makeActor() {
  return Keypair.random();
}

function makeContractId() {
  return StrKey.encodeContract(Buffer.alloc(32, 0x42));
}

function fakeServer(resourceFee: number, actor: Keypair) {
  const server = new rpc.Server('http://localhost:8000/rpc', {
    allowHttp: true,
  });

  const sorobanData = new SorobanDataBuilder().setResourceFee(resourceFee).build();

  const success: any = {
    _parsed: true,
    id: '1',
    latestLedger: 1000,
    transactionData: new SorobanDataBuilder(sorobanData),
    minResourceFee: String(resourceFee),
    result: {
      auth: [],
      retval: xdr.ScVal.scvVoid(),
    },
    events: [],
  };

  server.getAccount = vi.fn(async () => new Account(actor.publicKey(), '1'));
  server.simulateTransaction = vi.fn(async () => success);
  return { server, success };
}

function makeTransport(
  server: rpc.Server,
  maxFeeStrokes: number
): SdkSorobanTransport {
  const config: StellarNetworkConfig = {
    environment: 'testnet',
    networkPassphrase,
    rpcUrl: 'http://localhost:8000/rpc',
    entityRegistryContractId: makeContractId(),
    credentialRegistryContractId: makeContractId(),
    explorerBase: null,
    smartWalletWasmAllowlist: [],
    feePayerAddress: null,
    feePayerSecret: null,
    maxFeeStrokes,
    relayerDailyBudget: 500,
  };
  const transport = new SdkSorobanTransport(config);
  (transport as any).server = server;
  return transport;
}

function makeSpec(actor: Keypair): ContractCallSpec {
  return {
    contractId: makeContractId(),
    method: 'get_credential',
    args: [{ kind: 'bytes32' as const, hex: 'a1'.repeat(32) }],
    actorAddress: actor.publicKey(),
  };
}

function feeOf(preparedXdr: string): number {
  const tx = TransactionBuilder.fromXDR(preparedXdr, networkPassphrase);
  if (!(tx instanceof Transaction)) {
    throw new Error('expected a Transaction');
  }
  return Number(tx.fee);
}

describe('SdkSorobanTransport fee cap', () => {
  it('prepares a transaction whose total fee is inclusion + resource fee', async () => {
    const actor = makeActor();
    const { server } = fakeServer(500, actor);
    const transport = makeTransport(server, 1_000);

    const outcome = await transport.simulate(makeSpec(actor));

    expect(outcome.contractError).toBeNull();
    expect(outcome.preparedXdr).not.toBe('');
    expect(feeOf(outcome.preparedXdr)).toBe(INCLUSION_FEE + 500);
  });

  it('rejects the prepared transaction when total fee exceeds the configured cap', async () => {
    const actor = makeActor();
    const { server } = fakeServer(500, actor);
    const transport = makeTransport(server, 500); // cap is too low (needs BASE_FEE + 500)

    await expect(transport.simulate(makeSpec(actor))).rejects.toSatisfy(
      (e: unknown) => isDomainError(e, 'INVALID_INPUT')
    );
  });

  it('enforces the cap in enforcing assemble mode as well', async () => {
    const actor = makeActor();
    const { server } = fakeServer(500, actor);
    const transport = makeTransport(server, 500);

    // Build and sign a transaction with the minimum inclusion fee, matching
    // what a correct client would produce.
    const unsigned = new TransactionBuilder(
      new Account(actor.publicKey(), '1'),
      { fee: String(INCLUSION_FEE), networkPassphrase }
    )
      .addOperation(
        Operation.invokeHostFunction({
          func: xdr.HostFunction.hostFunctionTypeUploadContractWasm(Buffer.alloc(0)),
          auth: [],
        })
      )
      .setTimeout(180)
      .build();

    unsigned.sign(actor);
    const signedXdr = unsigned.toXDR();

    await expect(
      transport.enforcingSimulateAndAssemble(signedXdr)
    ).rejects.toSatisfy((e: unknown) => isDomainError(e, 'INVALID_INPUT'));
  });
});
