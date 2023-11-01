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
    toNano,
    internal,
    MessageRelaxed,
    storeMessageRelaxed,
} from "@ton/core";
import { Op } from "./Ops";

export const MIN_BALANCE = toNano("0.05");

const ADDRNULL = new Address(0, Buffer.alloc(32));

export type BundleConfig = {
    owner: Address;
};

// actions#_ (HashmapE 48 ^MessageAny) = Actions;
export const ActionsValues: DictionaryValue<MessageRelaxed> = {
    serialize: (src, builder) => {
        builder.storeRef(beginCell().store(storeMessageRelaxed(src)));
    },
    parse: (src) => {
        return internal({ to: ADDRNULL, value: 0n });
    },
};

export type ScheduledMessage = { at: number; message: MessageRelaxed };

export function actionsToDict(
    actions: ScheduledMessage[]
): Dictionary<number, MessageRelaxed> {
    const result = Dictionary.empty(Dictionary.Keys.Uint(48), ActionsValues);
    for (let action of actions) {
        result.set(action.at, action.message);
    }
    return result;
}

export function bundleConfigToCell(config: BundleConfig): Cell {
    return beginCell().storeAddress(config.owner).storeDict(null).endCell();
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

    static transferMessage(
        to: Address,
        response: Address,
        forwardAmount: bigint = toNano("0.01"),
        value?: bigint,
        customPayload?: Cell,
        forwardPayload?: Cell
    ) {
        return beginCell()
            .storeUint(Op.transfer, 32)
            .storeUint(0, 64)
            .storeAddress(to)
            .storeAddress(response)
            .storeMaybeRef(customPayload)
            .storeCoins(forwardAmount)
            .storeMaybeRef(forwardPayload)
            .endCell();
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
            body: Bundle.transferMessage(
                to,
                response,
                forwardAmount,
                value,
                customPayload,
                forwardPayload
            ),
        });
    }

    async sendMessages(
        provider: ContractProvider,
        via: Sender,
        messages: ScheduledMessage[],
        value: bigint = toNano("1")
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Op.send, 32)
                .storeUint(0, 64) // query_id
                .storeDict(actionsToDict(messages))
                .endCell(),
        });
    }

    async sendSchedule(
        provider: ContractProvider,
        via: Sender,
        messages: ScheduledMessage[],
        value: bigint = toNano("1")
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Op.schedule_actions, 32)
                .storeUint(0, 64)
                .storeDict(actionsToDict(messages))
                .endCell(),
        });
    }

    async sendTouch(
        provider: ContractProvider,
        via: Sender,
        value: bigint = toNano("0.1"),
        ensuringKey?: number
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Op.touch, 32)
                .storeUint(0, 64)
                .storeMaybeUint(ensuringKey, 48)
                .endCell(),
        });
    }

    async sendGetStaticData(
        provider: ContractProvider,
        via: Sender,
        value = toNano("0.02")
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Op.get_static_data, 32)
                .storeUint(0, 64)
                .endCell(),
        });
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

    async getOwnerAddress(provider: ContractProvider) {
        const { owner } = await this.getNFTData(provider);
        return owner;
    }

    async getReward(provider: ContractProvider) {
        const { stack } = await provider.get("get_reward", []);
        return stack.readBigNumber();
    }

    async getScheduledActions(provider: ContractProvider) {
        const { stack } = await provider.get("get_scheduled_actions", []);
        const givenDictCell = stack.readCellOpt();
        if (givenDictCell) {
            return Dictionary.loadDirect(
                Dictionary.Keys.Uint(48),
                ActionsValues,
                givenDictCell
            );
        }
        return null;
    }

    async getTouchRewardAndFee(provider: ContractProvider) {
        const { stack } = await provider.get("get_touch_reward_and_fee", []);
        return {
            reward: stack.readBigNumber(),
            fee: stack.readBigNumber(),
        };
    }
}
