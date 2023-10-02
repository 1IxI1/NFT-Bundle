import { Blockchain, SandboxContract, TreasuryContract } from "@ton/sandbox";
import { Cell, beginCell, fromNano, toNano } from "@ton/core";
import { Bundle } from "../wrappers/Bundle";
import { DNSItemContract } from "../wrappers/DNSItem";
import "@ton/test-utils";
import { compile } from "@ton/blueprint";
import { Op } from "../wrappers/Ops";
import { getSecureRandomNumber } from "@ton/crypto";
import { Errors } from "../wrappers/Errors";
import { randomAddress } from "@ton/test-utils";

// contract variables
const REWARD = toNano("0.36");
const MIN_BALANCE = toNano("0.05");

const around = (
    sent: bigint | undefined,
    expected: bigint,
    debugText?: string
) => {
    sent = sent ?? 0n;
    const d = expected - sent;
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
    return d <= toNano("0.001") && d >= 0;
};

describe("Bundle", () => {
    let bundleCode: Cell;
    let bundle: SandboxContract<Bundle>;
    let blockchain: Blockchain;
    let owner: SandboxContract<TreasuryContract>;
    let toucher: SandboxContract<TreasuryContract>;

    // using dns items in tests because they have
    // standard NFT interface and we can test both
    // interactions with NFTs and domains themselves
    let dnsItem1: SandboxContract<DNSItemContract>;
    let dnsItem2: SandboxContract<DNSItemContract>;
    let dnsItem3: SandboxContract<DNSItemContract>;

    beforeAll(async () => {
        blockchain = await Blockchain.create();
        blockchain.now = 100;

        owner = await blockchain.treasury("owner");
        toucher = await blockchain.treasury("toucher");

        bundleCode = await compile("Bundle");

        dnsItem1 = blockchain.openContract(
            DNSItemContract.createFromConfig({
                index: 1n,
                owner: owner.address,
            })
        );
        dnsItem2 = blockchain.openContract(
            DNSItemContract.createFromConfig({
                index: 2n,
                owner: owner.address,
            })
        );
        dnsItem3 = blockchain.openContract(
            DNSItemContract.createFromConfig({
                index: 3n,
                owner: owner.address,
            })
        );
        bundle = blockchain.openContract(
            Bundle.createFromConfig(
                {
                    owner: owner.address,
                    collectibles: [dnsItem1.address, dnsItem2.address],
                },
                bundleCode
            )
        );
        for (const cont of [dnsItem1, dnsItem2, dnsItem3]) {
            const deployResult = await cont.sendDeploy(
                owner.getSender(),
                toNano("1.5")
            );
            expect(deployResult.transactions).toHaveTransaction({
                on: cont.address,
                deploy: true,
            });
        }
        const deployPackResult = await bundle.sendDeploy(
            owner.getSender(),
            toNano("0.85")
        );
        expect(deployPackResult.transactions).toHaveTransaction({
            on: bundle.address,
            deploy: true,
        });
    });
    it("should deploy domains and the pack", async () => {
        // checks the success of beforeAll
    });
    it("should give uninit items", async () => {
        const collectibles = await bundle.getCollectibles();
        const domain1 = collectibles.get(0);
        const domain2 = collectibles.get(1);
        expect(domain1?.init).toBe(false);
        expect(domain2?.init).toBe(false);
        expect(domain1?.lastTouched).toBe(0);
        expect(domain2?.lastTouched).toBe(0);
        expect(domain1?.itemAddress.equals(dnsItem1.address)).toBe(true);
        expect(domain2?.itemAddress.equals(dnsItem2.address)).toBe(true);
    });
    it("should have uninit in its nft data while items are uninit", async () => {
        const data = await bundle.getNFTData();
        expect(data.inited).toBe(false);
    });
    it("should receive and init domain on transfer", async () => {
        blockchain.now = 120;
        const transferResult = await dnsItem1.sendTransfer(
            owner.getSender(),
            bundle.address,
            owner.address
        );
        expect(transferResult.transactions).toHaveTransaction({
            from: dnsItem1.address,
            to: bundle.address,
            op: Op.ownership_assigned,
            success: true,
        });
        const collectibles = await bundle.getCollectibles();
        const domain1 = collectibles.get(0);
        expect(domain1?.init).toBe(true);
        expect(domain1?.lastTouched).toBe(blockchain.now);
        expect(domain1?.itemAddress.equals(dnsItem1.address)).toBe(true);
    });
    it("should not touch uninited domain", async () => {
        const collectibles = await bundle.getCollectibles();
        const domain2 = collectibles.get(1);
        expect(domain2?.init).toBe(false);
        expect(domain2?.lastTouched).toBe(0);
        const touchResult = await bundle.sendTouch(
            toucher.getSender(),
            1,
            true
        );
        expect(touchResult.transactions).toHaveTransaction({
            on: bundle.address,
            op: Op.touch,
            success: false,
            exitCode: Errors.not_inited,
        });
    });
    it("should init the second domain", async () => {
        blockchain.now = 130;
        const transferResult = await dnsItem2.sendTransfer(
            owner.getSender(),
            bundle.address,
            owner.address
        );
        expect(transferResult.transactions).toHaveTransaction({
            from: dnsItem2.address,
            to: bundle.address,
            op: Op.ownership_assigned,
            success: true,
        });
        const collectibles = await bundle.getCollectibles();
        const domain2 = collectibles.get(1);
        expect(domain2?.init).toBe(true);
        expect(domain2?.lastTouched).toBe(blockchain.now);
        expect(domain2?.itemAddress.equals(dnsItem2.address)).toBe(true);
    });
    it("should add third domain", async () => {
        blockchain.now = 140;
        const collectiblesBefore = await bundle.getCollectibles();
        expect(collectiblesBefore.size).toEqual(2);
        const addResult = await bundle.sendAddItem(
            owner.getSender(),
            dnsItem3.address
        );
        expect(addResult.transactions).toHaveTransaction({
            on: bundle.address,
            op: Op.add_item,
            success: true,
        });
        const collectiblesAfter = await bundle.getCollectibles();
        expect(collectiblesAfter.size).toEqual(3);
        const domain3 = collectiblesAfter.get(2);
        expect(domain3?.init).toBe(false);
        expect(domain3?.lastTouched).toBe(0);
        expect(domain3?.itemAddress.equals(dnsItem3.address)).toBe(true);
    });
    it("should init the third domain", async () => {
        blockchain.now = 150;
        await dnsItem3.sendTransfer(
            owner.getSender(),
            bundle.address,
            owner.address
        );
        const collectibles = await bundle.getCollectibles();
        const domain3 = collectibles.get(2);
        expect(domain3?.init).toBe(true);
        expect(domain3?.lastTouched).toBe(blockchain.now);
    });
    it("should give every domain its index", async () => {
        const d1Index = await bundle.getCollectibleIndex(dnsItem1.address);
        const d2Index = await bundle.getCollectibleIndex(dnsItem2.address);
        const d3Index = await bundle.getCollectibleIndex(dnsItem3.address);
        expect(d1Index).toEqual(0);
        expect(d2Index).toEqual(1);
        expect(d3Index).toEqual(2);
    });
    it("should allow to edit some domain record", async () => {
        blockchain.now = 160;
        const domainIndex = await bundle.getCollectibleIndex(dnsItem1.address);
        const categoryToEdit = BigInt(await getSecureRandomNumber(1, 1 << 51));
        const editResult = await bundle.sendChangeRecordReq(
            owner.getSender(),
            domainIndex,
            categoryToEdit,
            Cell.EMPTY
        );
        expect(editResult.transactions).toHaveTransaction({
            from: owner.address,
            to: bundle.address,
            op: Op.change_dns_record_req,
            success: true,
        });
        expect(editResult.transactions).toHaveTransaction({
            from: bundle.address,
            to: dnsItem1.address,
            op: Op.change_dns_record,
            success: true,
            body: DNSItemContract.createEditRecordBody(
                categoryToEdit,
                Cell.EMPTY
            ),
        });
    });
    it("should write edit record as a touch", async () => {
        const collectibles = await bundle.getCollectibles();
        const domain1 = collectibles.get(0);
        expect(domain1?.lastTouched).toBe(blockchain.now);
    });
    it("should not let to touch for reward if not enough time passed", async () => {
        const now = blockchain.now || 0;
        blockchain.now = now + 28944000 - 1; // almost 11 months
        const touchRes = await bundle.sendTouch(toucher.getSender(), 0, false);
        expect(touchRes.transactions).toHaveTransaction({
            from: toucher.address,
            to: bundle.address,
            op: Op.touch,
            success: false,
            exitCode: Errors.early_touch,
        });
    });
    it("should touch and give reward", async () => {
        const now = blockchain.now || 0;
        blockchain.now = now + 1;
        const touchRes = await bundle.sendTouch(toucher.getSender(), 0, false);
        expect(touchRes.transactions).toHaveTransaction({
            from: toucher.address,
            to: bundle.address,
            op: Op.touch,
            success: true,
        });
        expect(touchRes.transactions).toHaveTransaction({
            from: bundle.address,
            to: dnsItem1.address,
            op: 0,
            success: true,
        });
        expect(touchRes.transactions).toHaveTransaction({
            from: bundle.address,
            to: toucher.address,
            op: Op.reward,
            success: true,
            value: (x) => around(x, REWARD),
        });
        const contract = await blockchain.getContract(bundle.address);
        expect(contract.balance).toBeGreaterThan(REWARD);
        expect(contract.balance).toBeLessThan(2n * REWARD);
    });
    it("should give specified reward with allow_min_reward if enough money", async () => {
        const touchRes = await bundle.sendTouch(toucher.getSender(), 1, true); // set allow_min_reward
        expect(touchRes.transactions).toHaveTransaction({
            from: toucher.address,
            to: bundle.address,
            op: Op.touch,
            success: true,
        });
        expect(touchRes.transactions).toHaveTransaction({
            from: bundle.address,
            to: dnsItem2.address,
            op: 0,
            success: true,
        });
        expect(touchRes.transactions).toHaveTransaction({
            from: bundle.address,
            to: toucher.address,
            op: Op.reward,
            success: true,
            value: (x) => around(x, REWARD),
        });
        const contract = await blockchain.getContract(bundle.address);
        expect(contract.balance).toBeLessThan(REWARD);
    });
    it("should not touch if not enough money on balance and full reward", async () => {
        const touchRes = await bundle.sendTouch(toucher.getSender(), 0, false);
        expect(touchRes.transactions).toHaveTransaction({
            from: toucher.address,
            to: bundle.address,
            op: Op.touch,
            success: false,
            exitCode: Errors.not_enough_balance,
        });
    });
    it("should touch with min reward", async () => {
        const touchRes = await bundle.sendTouch(toucher.getSender(), 0, true);
        expect(touchRes.transactions).toHaveTransaction({
            from: toucher.address,
            to: bundle.address,
            op: Op.touch,
            success: true,
        });
        expect(touchRes.transactions).toHaveTransaction({
            from: bundle.address,
            to: toucher.address,
            op: Op.reward,
        });
    });
    it("should now have minimum balance", async () => {
        // no time pased between last 2 actions ->
        // no storage fees ->
        // exact min_balance on contract
        const packContract = await blockchain.getContract(bundle.address);
        expect(packContract.balance).toEqual(MIN_BALANCE);
    });
    it("should not touch if not enough money even for minimum reward", async () => {
        const touchRes = await bundle.sendTouch(
            toucher.getSender(),
            0,
            true,
            toNano("0.008")
        );
        expect(touchRes.transactions).toHaveTransaction({
            from: toucher.address,
            to: bundle.address,
            success: false,
            exitCode: Errors.not_enough_balance,
        });
    });
    it("should not add domain not from owner", async () => {
        const addResult = await bundle.sendAddItem(
            toucher.getSender(),
            randomAddress()
        );
        expect(addResult.transactions).toHaveTransaction({
            from: toucher.address,
            to: bundle.address,
            op: Op.add_item,
            success: false,
            exitCode: Errors.unauthorized,
        });
    });
    let newOwner: SandboxContract<TreasuryContract>;
    it("should transfer whole pack", async () => {
        newOwner = await blockchain.treasury("newOwner");
        const contractBefore = await blockchain.getContract(bundle.address);
        const transferResult = await bundle.sendTransfer(
            owner.getSender(),
            newOwner.address,
            owner.address,
            toNano("0.05")
        );
        expect(transferResult.transactions).toHaveTransaction({
            from: owner.address,
            to: bundle.address,
            success: true,
            op: Op.transfer,
        });
        expect(transferResult.transactions).toHaveTransaction({
            from: bundle.address,
            to: owner.address,
            success: true,
        });
        expect(transferResult.transactions).toHaveTransaction({
            from: bundle.address,
            to: newOwner.address,
            op: Op.ownership_assigned,
            value: toNano("0.05"),
            success: true,
        });
        expect(transferResult.transactions).toHaveTransaction({
            from: bundle.address,
            to: owner.address,
            op: Op.excesses,
            success: true,
        });
        const contractAfter = await blockchain.getContract(bundle.address);
        expect(contractAfter.balance).toEqual(contractBefore.balance);
    });
    it("should give the new owner address", async () => {
        const data = await bundle.getNFTData();
        expect(data.owner.equals(newOwner.address)).toBe(true);
    });
    it("shoudl report static data", async () => {
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
    it("should transfer back", async () => {
        await bundle.sendTransfer(
            newOwner.getSender(),
            owner.address,
            owner.address,
            toNano("0.05")
        );
        const data = await bundle.getNFTData();
        expect(data.owner.equals(owner.address)).toBe(true);
    });
    let deletedIndex: number;
    it("should unpack and transfer a domain", async () => {
        deletedIndex = await bundle.getCollectibleIndex(dnsItem1.address);
        const unpackResult = await bundle.sendUnpack(
            owner.getSender(),
            deletedIndex
        );
        expect(unpackResult.transactions).toHaveTransaction({
            from: owner.address,
            to: bundle.address,
            op: Op.unpack,
            success: true,
        });
        expect(unpackResult.transactions).toHaveTransaction({
            from: bundle.address,
            to: dnsItem1.address,
            op: Op.transfer,
            outMessagesCount: 1,
            success: true,
        });
        expect(unpackResult.transactions).toHaveTransaction({
            from: dnsItem1.address,
            to: owner.address,
            op: Op.excesses,
            success: true,
        });
    });
    it("should shift other collectibles by index", async () => {
        const collectibles = await bundle.getCollectibles();
        expect(collectibles.get(0)?.itemAddress.equals(dnsItem2.address)).toBe(
            true
        );
        expect(collectibles.get(1)?.itemAddress.equals(dnsItem3.address)).toBe(
            true
        );
        expect(collectibles.get(2)).toBe(undefined);
    });
    it("should not unpack not from owner", async () => {
        const domainIndex = await bundle.getCollectibleIndex(dnsItem2.address);
        const unpackResult = await bundle.sendUnpack(
            toucher.getSender(),
            domainIndex
        );
        expect(unpackResult.transactions).toHaveTransaction({
            from: toucher.address,
            to: bundle.address,
            op: Op.unpack,
            success: false,
            exitCode: Errors.unauthorized,
        });
    });
    it("should not unpack if not enough money", async () => {
        const domainIndex = await bundle.getCollectibleIndex(dnsItem2.address);
        const unpackResultNo = await bundle.sendUnpack(
            owner.getSender(),
            domainIndex,
            toNano("0.14") - 1n
        );
        expect(unpackResultNo.transactions).toHaveTransaction({
            from: owner.address,
            to: bundle.address,
            op: Op.unpack,
            success: false,
            exitCode: Errors.not_enough_tons,
        });
        const unpackResultOk = await bundle.sendUnpack(
            owner.getSender(),
            domainIndex,
            toNano("0.14")
        );
        expect(unpackResultOk.transactions).toHaveTransaction({
            from: owner.address,
            to: bundle.address,
            op: Op.unpack,
            success: true,
            outMessagesCount: 1,
        });
        expect(unpackResultOk.transactions).toHaveTransaction({
            from: dnsItem2.address,
            to: owner.address,
            op: Op.excesses,
        });
    });
    it("should unpack uninited domain without transfer", async () => {
        const collectiblesBefore = await bundle.getCollectibles();
        const addResult = await bundle.sendAddItem(
            owner.getSender(),
            dnsItem1.address
        );
        expect(addResult.transactions).toHaveTransaction({
            from: owner.address,
            to: bundle.address,
            success: true,
        });
        const domainIndex = await bundle.getCollectibleIndex(dnsItem1.address);
        const unpackResult = await bundle.sendUnpack(
            owner.getSender(),
            domainIndex
        );
        expect(unpackResult.transactions).toHaveTransaction({
            from: owner.address,
            to: bundle.address,
            op: Op.unpack,
            success: true,
            outMessagesCount: 0,
        });
        const collectiblesAfter = await bundle.getCollectibles();
        expect(collectiblesAfter.size).toEqual(collectiblesBefore.size);
    });
    it("should withdraw all to leave min balance", async () => {});
    it("should not unpack if not enough for filling up min balance", async () => {
        // preparation - touch for leaving min balance
        // and travel in time to spend balance on storage fee
        const now = blockchain.now || 0;
        blockchain.now = now + 28944000;
        const touchRes = await bundle.sendTouch(toucher.getSender(), 0, true);
        expect(touchRes.transactions).toHaveTransaction({
            from: toucher.address,
            to: bundle.address,
            op: Op.touch,
            success: true,
        });
        const contractAfter1 = await blockchain.getContract(bundle.address);
        expect(contractAfter1.balance).toEqual(MIN_BALANCE);
        blockchain.now += 32000000;
        // just inititiate of spending storage fee
        await bundle.sendDeploy(owner.getSender(), 1n);
        const contractAfter2 = await blockchain.getContract(bundle.address);
        expect(contractAfter2.balance).toBeLessThan(
            MIN_BALANCE - toNano("0.01")
        );

        const domainIndex = await bundle.getCollectibleIndex(dnsItem3.address);
        const unpackResultNo = await bundle.sendUnpack(
            owner.getSender(),
            domainIndex,
            toNano("0.14")
        );
        expect(unpackResultNo.transactions).toHaveTransaction({
            from: owner.address,
            to: bundle.address,
            op: Op.unpack,
            success: false,
            exitCode: Errors.not_enough_balance,
        });
    });
    it("should unpack if enough for filling", async () => {
        const domainIndex = await bundle.getCollectibleIndex(dnsItem3.address);
        const unpackResult = await bundle.sendUnpack(
            owner.getSender(),
            domainIndex,
            toNano("0.16")
        );
        expect(unpackResult.transactions).toHaveTransaction({
            from: owner.address,
            to: bundle.address,
            op: Op.unpack,
            success: true,
        });
    });
    it("should unpack all the items", async () => {
        // preparation - add 2 domains because we've unpacked all of them
        await bundle.sendAddItem(owner.getSender(), dnsItem1.address);
        await bundle.sendAddItem(owner.getSender(), dnsItem2.address);
        await dnsItem1.sendTransfer(
            owner.getSender(),
            bundle.address,
            owner.address
        );
        await dnsItem2.sendTransfer(
            owner.getSender(),
            bundle.address,
            owner.address
        );
        const collectibles = await bundle.getCollectibles();
        expect(collectibles.size).toEqual(2);
        expect(collectibles.get(0)?.init).toBe(true);
        expect(collectibles.get(0)?.init).toBe(true);

        const unpackResult = await bundle.sendUnpackAll(owner.getSender());
        expect(unpackResult.transactions).toHaveTransaction({
            from: owner.address,
            to: bundle.address,
            op: Op.unpack_all,
            success: true,
            outMessagesCount: 3, // 2 for transfers + 1 for excesses
        });
        expect(unpackResult.transactions).toHaveTransaction({
            from: dnsItem1.address,
            to: owner.address,
            op: Op.excesses,
        });
        expect(unpackResult.transactions).toHaveTransaction({
            from: dnsItem2.address,
            to: owner.address,
            op: Op.excesses,
        });
        expect(unpackResult.transactions).toHaveTransaction({
            from: bundle.address,
            to: owner.address,
            op: Op.excesses,
        });
        const contract = await blockchain.getContract(bundle.address);
        expect(contract.balance).toEqual(0n);
    });
});
