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

export type DNSPackConfig = {
    owner: Address;
    domains: Address[];
};

export type DNSItemsValue = {
    domainAddress: Address;
    init: boolean;
    lastTouched: number;
};

export const DNSItemsValues: DictionaryValue<DNSItemsValue> = {
    serialize: (src, builder) => {
        builder.storeAddress(src.domainAddress);
        builder.storeBit(src.init);
        builder.storeUint(src.lastTouched, 48);
    },
    parse: (src) => {
        return {
            domainAddress: src.loadAddress(),
            init: src.loadBit(),
            lastTouched: src.loadUint(48),
        };
    },
};

export function domainsToDict(
    domains: Address[]
): Dictionary<number, DNSItemsValue> {
    const result = Dictionary.empty(Dictionary.Keys.Uint(8), DNSItemsValues);
    for (let i = 0; i < domains.length; i++) {
        result.set(i, {
            domainAddress: domains[i],
            init: false,
            lastTouched: 0,
        });
    }
    return result;
}

export function dnsPackConfigToCell(config: DNSPackConfig): Cell {
    const domainsDict = domainsToDict(config.domains);
    return beginCell()
        .storeUint(0, 8) // inited_count
        .storeDict(domainsDict)
        .storeAddress(config.owner)
        .endCell();
}

export class DNSPack implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell }
    ) {}

    static createFromAddress(address: Address) {
        return new DNSPack(address);
    }

    static createFromConfig(config: DNSPackConfig, code: Cell, workchain = 0) {
        const data = dnsPackConfigToCell(config);
        const init = { code, data };
        return new DNSPack(contractAddress(workchain, init), init);
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

    async sendAddDomain(
        provider: ContractProvider,
        via: Sender,
        domain: Address,
        value: bigint = toNano("0.02")
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Op.add_domain, 32)
                .storeUint(0, 64)
                .storeAddress(domain)
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
            body: beginCell()
                .storeUint(Op.unpack_all, 32)
                .storeUint(0, 64)
                .endCell(),
        });
    }

    async getDomains(provider: ContractProvider) {
        const { stack } = await provider.get("get_domains", []);
        const domainsCell = stack.readCellOpt();
        return Dictionary.loadDirect(
            Dictionary.Keys.Uint(8),
            DNSItemsValues,
            domainsCell
        );
    }

    async getDomainIndex(provider: ContractProvider, domain: Address) {
        const domains = await this.getDomains(provider);
        for (let i = 0; i < domains.size; i++) {
            const item = domains.get(i);
            if (!item) return -1;
            if (item.domainAddress.equals(domain)) {
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
