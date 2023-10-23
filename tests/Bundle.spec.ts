import {
    Blockchain,
    SandboxContract,
    TreasuryContract,
    BlockchainSnapshot,
    printTransactionFees,
} from "@ton/sandbox";
import {
    Address,
    Cell,
    beginCell,
    fromNano,
    internal,
    toNano,
} from "@ton/core";
import { Bundle, ScheduledMessage } from "../wrappers/Bundle";
import "@ton/test-utils";
import { compile } from "@ton/blueprint";
import { Op } from "../wrappers/Ops";
import { Errors } from "../wrappers/Errors";
import { randomAddress } from "@ton/test-utils";
import { V1, getRandomTon } from "../utils";

// contract variables
const REWARD = toNano("0.36");
const MIN_BALANCE = toNano("0.05");
const FWD_FEE = 666672n;

const around = (
    sent: bigint | undefined,
    expected: bigint,
    gap: bigint = toNano("0.004"),
    debugText?: string
) => {
    sent = sent ?? 0n;
    let d = expected - sent;
    if (d < 0) d *= -1n;
    if (debugText) {
        console.log(
            debugText,
            "expected:",
            fromNano(expected),
            "sent:",
            fromNano(sent),
            "difference:",
            fromNano(d),
            ""
        );
    }
    return d <= gap;
};

describe("Bundle", () => {
    let bundleCode: Cell;
    let bundle: SandboxContract<Bundle>;
    let blockchain: Blockchain;
    let owner: SandboxContract<TreasuryContract>;
    let toucher: SandboxContract<TreasuryContract>;

    beforeAll(async () => {
        blockchain = await Blockchain.create();
        blockchain.now = 100;

        owner = await blockchain.treasury("owner");
        toucher = await blockchain.treasury("toucher");

        bundleCode = await compile("Bundle");

        bundle = blockchain.openContract(
            Bundle.createFromConfig(
                {
                    owner: owner.address,
                },
                bundleCode
            )
        );

        const deployBundleResult = await bundle.sendDeploy(
            owner.getSender(),
            toNano("0.5")
        );
        expect(deployBundleResult.transactions).toHaveTransaction({
            on: bundle.address,
            deploy: true,
        });
    });
    it("should deploy domains and the pack", async () => {
        // checks the success of beforeAll
    });

    let msgs: ScheduledMessage[];
    let totalValue = 0n;
    let readyToUse: BlockchainSnapshot;
    it("should resend all messages from owner", async () => {
        msgs = [];
        let values: bigint[] = [];
        for (let i = 105; i <= 200; i += 5) {
            const value = getRandomTon(0.1, 1);
            totalValue += value;
            values.push(value);
            msgs.push({
                at: i,
                message: internal({
                    to: randomAddress(),
                    bounce: false,
                    value,
                }),
            });
        }
        expect(msgs.length).toBe(20);

        const sendResult = await bundle.sendMessages(
            owner.getSender(),
            msgs,
            totalValue + toNano("0.5")
        );
        expect(sendResult.transactions).toHaveTransaction({
            from: owner.address,
            on: bundle.address,
            success: true,
            outMessagesCount: msgs.length,
        });
        for (let i = 0; i < msgs.length; i++) {
            const msg = msgs[i];
            if (msg.message.info.dest instanceof Address) {
                expect(sendResult.transactions).toHaveTransaction({
                    from: bundle.address,
                    to: msg.message.info.dest,
                    value: values[i],
                });
            } else {
                throw new Error("not an address");
            }
        }
        readyToUse = blockchain.snapshot();
    });

    it("should not resend all the messages not from admin", async () => {
        await blockchain.loadFrom(readyToUse);
        const sendResult = await bundle.sendMessages(toucher.getSender(), msgs);
        expect(sendResult.transactions).toHaveTransaction({
            from: toucher.address,
            on: bundle.address,
            success: false,
            exitCode: Errors.unauthorized,
        });
    });

    it("should not schedule messages if they have wrong amount", async () => {
        await blockchain.loadFrom(readyToUse);
        const sendResult = await bundle.sendSchedule(owner.getSender(), msgs);
        expect(sendResult.transactions).toHaveTransaction({
            from: owner.address,
            on: bundle.address,
            success: false,
            exitCode: Errors.incorrect_value,
        });
    });

    it("should not schedule even if one amount is incorrect", async () => {
        await blockchain.loadFrom(readyToUse);
        let msgsAlmostCorrect: ScheduledMessage[] = [];
        for (let i = 0; i < msgs.length; i++) {
            const dest = msgs[i].message.info.dest;
            if (dest instanceof Address) {
                msgsAlmostCorrect[i] = {
                    at: msgs[i].at,
                    message: internal({
                        to: dest,
                        bounce: false,
                        value:
                            i < msgs.length - 1
                                ? toNano("0.005")
                                : toNano("0.01"),
                    }),
                };
            }
        }
        const sendResult = await bundle.sendSchedule(
            owner.getSender(),
            msgsAlmostCorrect
        );
        expect(sendResult.transactions).toHaveTransaction({
            from: owner.address,
            on: bundle.address,
            success: false,
            exitCode: Errors.incorrect_value,
        });
    });

    it("should have null scheduled actions by default", async () => {
        await blockchain.loadFrom(readyToUse);
        const actions = await bundle.getScheduledActions();
        expect(actions).toBeNull();
    });

    let scheduled: BlockchainSnapshot;
    it("should schedule messages", async () => {
        await blockchain.loadFrom(readyToUse);
        let msgsToSchedule: ScheduledMessage[] = [];
        for (let i = 0; i < msgs.length; i++) {
            const dest = msgs[i].message.info.dest;
            if (dest instanceof Address) {
                msgsToSchedule[i] = {
                    at: msgs[i].at,
                    message: internal({
                        to: dest,
                        bounce: false,
                        value: toNano("0.005"),
                    }),
                };
            }
        }
        // await blockchain.setVerbosityForAddress(bundle.address, V1);
        const sendResult = await bundle.sendSchedule(
            owner.getSender(),
            msgsToSchedule,
            toNano("0.5")
        );
        expect(sendResult.transactions).toHaveTransaction({
            from: owner.address,
            on: bundle.address,
            success: true,
            outMessagesCount: 0,
        });
        scheduled = blockchain.snapshot();
    });

    it("should have scheduled actions", async () => {
        await blockchain.loadFrom(scheduled);
        const actions = await bundle.getScheduledActions();
        if (actions) {
            expect(actions.size).toBe(msgs.length);
            expect(actions.get(msgs[0].at)).not.toBeUndefined();
            expect(actions.get(msgs[msgs.length - 1].at)).not.toBeUndefined();
        } else {
            throw new Error("actions are null");
        }
    });

    let sentFirst: BlockchainSnapshot;
    it("should send the first message on touch", async () => {
        await blockchain.loadFrom(scheduled);
        blockchain.now = msgs[0].at;
        const { reward, fee } = await bundle.getTouchRewardAndFee();
        expect(reward).toBe(REWARD);
        const valueForGas = toNano("1");
        const sendResult = await bundle.sendTouch(
            toucher.getSender(),
            valueForGas,
            msgs[0].at
        );
        expect(sendResult.transactions).toHaveTransaction({
            from: toucher.address,
            on: bundle.address,
            success: true,
            outMessagesCount: 2, // 1st - touching the item, 2nd - sending the reward
        });
        const dest1 = msgs[0].message.info.dest;
        if (dest1 instanceof Address) {
            expect(sendResult.transactions).toHaveTransaction({
                from: bundle.address,
                to: dest1,
                value: toNano("0.005"),
            });
        } else {
            throw new Error("dest1 is not Address");
        }
        expect(sendResult.transactions).toHaveTransaction({
            from: bundle.address,
            to: toucher.address,
            value: (x) =>
                around(x!, REWARD + valueForGas - fee, toNano("0.001")),
        });
        sentFirst = blockchain.snapshot();
    });

    it("should have one less messages in scheduled", async () => {
        await blockchain.loadFrom(sentFirst);
        const actions = await bundle.getScheduledActions();
        expect(actions).not.toBeNull();
        expect(actions!.size).toBe(msgs.length - 1);
    });

    let sentThird: BlockchainSnapshot;
    it("should send 2 messages on touch", async () => {
        await blockchain.loadFrom(sentFirst);
        blockchain.now = msgs[2].at;
        const { reward, fee } = await bundle.getTouchRewardAndFee();
        expect(reward).toBe(REWARD * 2n);
        const valueForGas = toNano("1");
        const sendResult = await bundle.sendTouch(
            toucher.getSender(),
            valueForGas,
            msgs[1].at
        );
        sentThird = blockchain.snapshot();
        expect(sendResult.transactions).toHaveTransaction({
            from: toucher.address,
            on: bundle.address,
            success: true,
            outMessagesCount: 3,
        });
        const dest1 = msgs[1].message.info.dest;
        if (dest1 instanceof Address) {
            expect(sendResult.transactions).toHaveTransaction({
                from: bundle.address,
                to: dest1,
                value: toNano("0.005"),
            });
        }
        const dest2 = msgs[2].message.info.dest;
        if (dest2 instanceof Address) {
            expect(sendResult.transactions).toHaveTransaction({
                from: bundle.address,
                to: dest2,
                value: toNano("0.005"),
            });
        }
        expect(sendResult.transactions).toHaveTransaction({
            from: bundle.address,
            to: toucher.address,
            value: (x) =>
                around(x!, REWARD * 2n + valueForGas - fee, toNano("0.001")),
        });
        const topUpResult = await bundle.sendDeploy(
            owner.getSender(),
            toNano("100")
        );
        expect(topUpResult.transactions).toHaveTransaction({
            from: owner.address,
            to: bundle.address,
            success: true,
        });
        sentThird = blockchain.snapshot();
    });

    it("should have two less messages in scheduled", async () => {
        await blockchain.loadFrom(sentThird);
        const actions = await bundle.getScheduledActions();
        expect(actions).not.toBeNull();
        expect(actions!.size).toBe(msgs.length - 3);
    });

    it("should fail if not enough balance", async () => {
        await blockchain.loadFrom(sentFirst);
        const { balance } = await blockchain.getContract(bundle.address);
        const perOneTouch = toNano("0.005") + FWD_FEE + REWARD;
        const freeBalance = balance - MIN_BALANCE;
        const n = freeBalance / perOneTouch + 1n;
        const reqBalance = n * perOneTouch + MIN_BALANCE;
        const balanceDiff = reqBalance - balance;
        const valueForGas = toNano("1");
        blockchain.now = msgs[Number(n)].at; // should send `n` touches
        const sendResultBeforeTopUp = await bundle.sendTouch(
            toucher.getSender(),
            valueForGas
        );
        expect(sendResultBeforeTopUp.transactions).toHaveTransaction({
            from: toucher.address,
            on: bundle.address,
            success: false,
            exitCode: Errors.not_enough_balance,
        });

        await bundle.sendDeploy(
            owner.getSender(),
            balanceDiff + toNano("0.001")
        );

        const sendResultAfterTopUp = await bundle.sendTouch(
            toucher.getSender(),
            valueForGas
        );
        expect(sendResultAfterTopUp.transactions).toHaveTransaction({
            from: toucher.address,
            on: bundle.address,
            success: true,
            outMessagesCount: Number(n) + 1,
        });
    });

    let sentSixth: BlockchainSnapshot;
    it("should send 3 messages on touch", async () => {
        await blockchain.loadFrom(sentThird);
        blockchain.now = msgs[5].at; // sixth message
        const { reward, fee } = await bundle.getTouchRewardAndFee();
        expect(reward).toBe(REWARD * 3n);
        const valueForGas = toNano("1");
        const sendResult = await bundle.sendTouch(
            toucher.getSender(),
            valueForGas,
            msgs[3].at
        );
        expect(sendResult.transactions).toHaveTransaction({
            from: toucher.address,
            on: bundle.address,
            success: true,
            outMessagesCount: 4,
        });
        expect(sendResult.transactions).toHaveTransaction({
            from: bundle.address,
            to: toucher.address,
            value: (x) =>
                around(x!, REWARD * 3n + valueForGas - fee, toNano("0.001")),
        });
        sentSixth = blockchain.snapshot();
    });

    // msgs[5] of msgs[19] (6/20) were sent

    it("should send all remaining messages", async () => {
        await blockchain.loadFrom(sentSixth);
        blockchain.now = msgs[msgs.length - 1].at;
        const { reward, fee } = await bundle.getTouchRewardAndFee();
        const left = msgs.length - 6;
        expect(reward).toBe(REWARD * BigInt(left));
        const valueForGas = toNano("1");
        const sendResult = await bundle.sendTouch(
            toucher.getSender(),
            valueForGas,
            msgs[6].at
        );
        expect(sendResult.transactions).toHaveTransaction({
            from: toucher.address,
            on: bundle.address,
            success: true,
            outMessagesCount: left + 1,
        });
        expect(sendResult.transactions).toHaveTransaction({
            from: bundle.address,
            to: toucher.address,
            value: (x) =>
                around(
                    x!,
                    REWARD * BigInt(left) + valueForGas - fee,
                    toNano("0.03")
                ),
        });
    });

    it("should send 20 with one touch", async () => {
        await blockchain.loadFrom(scheduled);
        await bundle.sendDeploy(owner.getSender(), toNano("100")); // topup
        blockchain.now = msgs[msgs.length - 1].at;
        const { reward, fee } = await bundle.getTouchRewardAndFee();
        expect(reward).toBe(REWARD * BigInt(20));
        const valueForGas = toNano("1");
        const sendResult = await bundle.sendTouch(
            toucher.getSender(),
            valueForGas,
            msgs[0].at
        );
        expect(sendResult.transactions).toHaveTransaction({
            from: toucher.address,
            on: bundle.address,
            success: true,
            outMessagesCount: 21,
        });
        expect(sendResult.transactions).toHaveTransaction({
            from: bundle.address,
            to: toucher.address,
            value: (x) =>
                around(x!, REWARD * 20n + valueForGas - fee, toNano("0.05")),
        });
    });

    it("should fail if ensure key is expired", async () => {
        await blockchain.loadFrom(sentFirst);
        await bundle.sendDeploy(owner.getSender(), toNano("100")); // topup
        blockchain.now = msgs[msgs.length - 1].at;
        const sendResult = await bundle.sendTouch(
            toucher.getSender(),
            toNano("1"),
            msgs[0].at
        );
        expect(sendResult.transactions).toHaveTransaction({
            from: toucher.address,
            on: bundle.address,
            success: false,
            exitCode: Errors.expired,
        });
    });

    it("should work with no ensure key", async () => {
        await blockchain.loadFrom(sentFirst);
        await bundle.sendDeploy(owner.getSender(), toNano("100")); // topup
        blockchain.now = msgs[msgs.length - 1].at;
        const sendResult = await bundle.sendTouch(
            toucher.getSender(),
            toNano("1")
        );
        expect(sendResult.transactions).toHaveTransaction({
            from: toucher.address,
            on: bundle.address,
            success: true,
            outMessagesCount: msgs.length, // all, -1 already sent, +1 reward
        });
    });

    it("should report static data by TEP-62", async () => {
        const reportRes = await bundle.sendGetStaticData(toucher.getSender());
        expect(reportRes.transactions).toHaveTransaction({
            from: toucher.address,
            to: bundle.address,
            op: Op.get_static_data,
            success: true,
            outMessagesCount: 1,
        });
        expect(reportRes.transactions).toHaveTransaction({
            from: bundle.address,
            to: toucher.address,
            op: Op.report_static_data,
            success: true,
            // index & collection address
            body: beginCell()
                .storeUint(Op.report_static_data, 32)
                .storeUint(0, 64) // query id
                .storeUint(0, 256)
                .storeAddress(null)
                .endCell(),
        });
    });

    it("should have a proper get_nft_data get method", async () => {
        const data = await bundle.getNFTData();
        expect(data).toMatchObject({
            inited: true,
            index: 0,
            collection: null,
            content: null,
        });
        expect(owner.address.equals(data.owner)).toBe(true);
    });
});
