import {
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Sender,
  SendMode,
  Dictionary,
  DictionaryValue,
  TupleBuilder,
  toNano,
} from "@ton/core";
import { Op } from "./Ops";

export type BundleConfig = {
  owner: Address;
  collectibles: Address[];
};

export type DNSItemsValue = {
  itemAddress: Address;
  init: boolean;
  lastTouched: number;
};

export const DNSItemsValues: DictionaryValue<DNSItemsValue> = {
  serialize: (src, builder) => {
    builder.storeAddress(src.itemAddress);
    builder.storeBit(src.init);
    builder.storeUint(src.lastTouched, 48);
  },
  parse: (src) => {
    return {
      itemAddress: src.loadAddress(),
      init: src.loadBit(),
      lastTouched: src.loadUint(48),
    };
  },
};

export function collectiblesToDict(
  collectibles: Address[]
): Dictionary<number, DNSItemsValue> {
  const result = Dictionary.empty(Dictionary.Keys.Uint(8), DNSItemsValues);
  for (let i = 0; i < collectibles.length; i++) {
    result.set(i, {
      itemAddress: collectibles[i],
      init: false,
      lastTouched: 0,
    });
  }
  return result;
}

export function bundleConfigToCell(config: BundleConfig): Cell {
  const collectiblesDict = collectiblesToDict(config.collectibles);
  return beginCell()
    .storeUint(0, 8) // inited_count
    .storeDict(collectiblesDict)
    .storeAddress(config.owner)
    .endCell();
}

export class Bundle implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell }
  ) {}

  static createFromAddress(address: Address) {
    return new Bundle(address);
  }

  static createFromConfig(config: BundleConfig, code: Cell, workchain = 0) {
    const data = bundleConfigToCell(config);
    const init = { code, data };
    return new Bundle(contractAddress(workchain, init), init);
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
    });
  }

  /*
transfer#5fcc3d14 query_id:uint64 new_owner:MsgAddress response_destination:MsgAddress
                  custom_payload:(Maybe ^Cell) forward_amount:(VarUInteger 16)
                  forward_payload:(Either Cell ^Cell) = InternalMsgBody;
    */
  async sendTransfer(
    provider: ContractProvider,
    via: Sender,
    to: Address,
    response: Address,
    forwardAmount: bigint = toNano("0.01"),
    value?: bigint,
    customPayload?: Cell,
    forwardPayload?: Cell
  ) {
    await provider.internal(via, {
      value: value ? value : forwardAmount + toNano("0.05"),
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(Op.transfer, 32)
        .storeUint(0, 64)
        .storeAddress(to)
        .storeAddress(response)
        .storeMaybeRef(customPayload)
        .storeCoins(forwardAmount)
        .storeMaybeRef(forwardPayload)
        .endCell(),
    });
  }

  async sendAddItem(
    provider: ContractProvider,
    via: Sender,
    item: Address,
    value: bigint = toNano("0.02")
  ) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(Op.add_item, 32)
        .storeUint(0, 64)
        .storeAddress(item)
        .endCell(),
    });
  }

  // change_dns_record_req#5eb1f0f9 query_id:uint64 target_index:uint8
  //                                key:uint256 value:(Maybe ^Cell)
  //                                = InternalMsgBody;

  async sendChangeRecordReq(
    provider: ContractProvider,
    via: Sender,
    index: number,
    key: bigint,
    value?: Cell,
    tons: bigint = toNano("0.1")
  ) {
    await provider.internal(via, {
      value: tons,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(Op.change_dns_record_req, 32)
        .storeUint(0, 64)
        .storeUint(index, 8)
        .storeUint(key, 256)
        .storeMaybeRef(value)
        .endCell(),
    });
  }

  async sendTouch(
    provider: ContractProvider,
    via: Sender,
    index: number,
    allowMinReward: boolean,
    value: bigint = toNano("0.1")
  ) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(Op.touch, 32)
        .storeUint(0, 64)
        .storeUint(index, 8)
        .storeBit(allowMinReward)
        .endCell(),
    });
  }

  async sendUnpack(
    provider: ContractProvider,
    via: Sender,
    index: number,
    value: bigint = toNano("0.15")
  ) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(Op.unpack, 32)
        .storeUint(0, 64)
        .storeUint(index, 8)
        .endCell(),
    });
  }

  async sendUnpackAll(
    provider: ContractProvider,
    via: Sender,
    value: bigint = toNano("1")
  ) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().storeUint(Op.unpack_all, 32).storeUint(0, 64).endCell(),
    });
  }

  async getCollectibles(provider: ContractProvider) {
    const { stack } = await provider.get("get_collectibles", []);
    const collectiblesCell = stack.readCellOpt();
    return Dictionary.loadDirect(
      Dictionary.Keys.Uint(8),
      DNSItemsValues,
      collectiblesCell
    );
  }

  async getDomainIndex(provider: ContractProvider, target: Address) {
    const collectibles = await this.getCollectibles(provider);
    for (let i = 0; i < collectibles.size; i++) {
      const item = collectibles.get(i);
      if (!item) return -1;
      if (item.itemAddress.equals(target)) {
        return i;
      }
    }
    return -1;
  }

  async getNFTData(provider: ContractProvider) {
    const { stack } = await provider.get("get_nft_data", []);
    const inited = stack.readBoolean();
    const index = stack.readNumber();
    const collection = stack.readAddressOpt();
    const owner = stack.readAddress();
    const content = stack.readCellOpt();
    return { inited, index, collection, owner, content };
  }
}
