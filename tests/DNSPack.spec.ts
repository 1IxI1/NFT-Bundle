import {
    Blockchain,
    SandboxContract,
    TreasuryContract,
    printTransactionFees,
} from "@ton/sandbox";
import { Cell, fromNano, toNano } from "@ton/core";
import { DNSPack } from "../wrappers/DNSPack";
import { DNSItemContract } from "../wrappers/DNSItem";
import "@ton/test-utils";
import { compile } from "@ton/blueprint";
import { Op } from "../wrappers/Ops";
import { getSecureRandomNumber } from "@ton/crypto";
import { Errors } from "../wrappers/Errors";
import { randomAddress } from "@ton/test-utils";

const REWARD = toNano("0.36");
const MIN_BALANCE = toNano("0.05");

const around = (sent: bigint | undefined, expected: bigint) => {
    sent = sent ?? 0n;
    const d = expected - sent;
    return d <= toNano("0.001") && d >= 0;
};

describe("DNSPack", () => {
    let dnsPackCode: Cell;
    let dnsPack: SandboxContract<DNSPack>;
    let blockchain: Blockchain;
    let owner: SandboxContract<TreasuryContract>;
    let toucher: SandboxContract<TreasuryContract>;
    let dnsItem1: SandboxContract<DNSItemContract>;
    let dnsItem2: SandboxContract<DNSItemContract>;
    let dnsItem3: SandboxContract<DNSItemContract>;

    beforeAll(async () => {
        blockchain = await Blockchain.create();
        blockchain.now = 100;

        owner = await blockchain.treasury("owner");
        toucher = await blockchain.treasury("toucher");

        dnsPackCode = await compile("DNSPack");

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
        dnsPack = blockchain.openContract(
            DNSPack.createFromConfig(
                {
                    owner: owner.address,
                    domains: [dnsItem1.address, dnsItem2.address],
                },
                dnsPackCode
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
        const deployPackResult = await dnsPack.sendDeploy(
            owner.getSender(),
            // 1.5 of reward for touch tests
            (REWARD * 3n) / 2n
        );
        expect(deployPackResult.transactions).toHaveTransaction({
            on: dnsPack.address,
            deploy: true,
        });
    });
    it("should deploy domains and the pack", async () => {
        // checks the success of beforeAll
    });
    it("should give uninit domains", async () => {
        const domains = await dnsPack.getDomains();
        const domain1 = domains.get(0);
        const domain2 = domains.get(1);
        expect(domain1?.init).toBe(false);
        expect(domain2?.init).toBe(false);
        expect(domain1?.lastTouched).toBe(0);
        expect(domain2?.lastTouched).toBe(0);
        expect(domain1?.domainAddress.equals(dnsItem1.address)).toBe(true);
        expect(domain2?.domainAddress.equals(dnsItem2.address)).toBe(true);
    });
    it("should receive and init domain on transfer", async () => {
        blockchain.now = 120;
        const transferResult = await dnsItem1.sendTransfer(
            owner.getSender(),
            dnsPack.address,
            owner.address
        );
        expect(transferResult.transactions).toHaveTransaction({
            from: dnsItem1.address,
            to: dnsPack.address,
            op: Op.ownership_assigned,
            success: true,
        });
        const domains = await dnsPack.getDomains();
        const domain1 = domains.get(0);
        expect(domain1?.init).toBe(true);
        expect(domain1?.lastTouched).toBe(blockchain.now);
        expect(domain1?.domainAddress.equals(dnsItem1.address)).toBe(true);
    });
    it("should init the second domain", async () => {
        blockchain.now = 130;
        const transferResult = await dnsItem2.sendTransfer(
            owner.getSender(),
            dnsPack.address,
            owner.address
        );
        expect(transferResult.transactions).toHaveTransaction({
            from: dnsItem2.address,
            to: dnsPack.address,
            op: Op.ownership_assigned,
            success: true,
        });
        const domains = await dnsPack.getDomains();
        const domain2 = domains.get(1);
        expect(domain2?.init).toBe(true);
        expect(domain2?.lastTouched).toBe(blockchain.now);
        expect(domain2?.domainAddress.equals(dnsItem2.address)).toBe(true);
    });
    it("should add third domain", async () => {
        blockchain.now = 140;
        const domainsBefore = await dnsPack.getDomains();
        expect(domainsBefore.size).toEqual(2);
        const addResult = await dnsPack.sendAddDomain(
            owner.getSender(),
            dnsItem3.address
        );
        expect(addResult.transactions).toHaveTransaction({
            on: dnsPack.address,
            op: Op.add_domain,
            success: true,
        });
        const domainsAfter = await dnsPack.getDomains();
        expect(domainsAfter.size).toEqual(3);
        const domain3 = domainsAfter.get(2);
        expect(domain3?.init).toBe(false);
        expect(domain3?.lastTouched).toBe(0);
        expect(domain3?.domainAddress.equals(dnsItem3.address)).toBe(true);
    });
    it("should init the third domain", async () => {
        blockchain.now = 150;
        await dnsItem3.sendTransfer(
            owner.getSender(),
            dnsPack.address,
            owner.address
        );
        const domains = await dnsPack.getDomains();
        const domain3 = domains.get(2);
        expect(domain3?.init).toBe(true);
        expect(domain3?.lastTouched).toBe(blockchain.now);
    });
    it("should give every domain its index", async () => {
        const d1Index = await dnsPack.getDomainIndex(dnsItem1.address);
        const d2Index = await dnsPack.getDomainIndex(dnsItem2.address);
        const d3Index = await dnsPack.getDomainIndex(dnsItem3.address);
        expect(d1Index).toEqual(0);
        expect(d2Index).toEqual(1);
        expect(d3Index).toEqual(2);
    });
    it("should allow to edit some domain record", async () => {
        blockchain.now = 160;
        const domainIndex = await dnsPack.getDomainIndex(dnsItem1.address);
        const categoryToEdit = BigInt(await getSecureRandomNumber(1, 1 << 51));
        const editResult = await dnsPack.sendChangeRecordReq(
            owner.getSender(),
            domainIndex,
            categoryToEdit,
            Cell.EMPTY
        );
        expect(editResult.transactions).toHaveTransaction({
            from: owner.address,
            to: dnsPack.address,
            op: Op.change_dns_record_req,
            success: true,
        });
        expect(editResult.transactions).toHaveTransaction({
            from: dnsPack.address,
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
        const domains = await dnsPack.getDomains();
        const domain1 = domains.get(0);
        expect(domain1?.lastTouched).toBe(blockchain.now);
    });
    it("should not let to touch for reward if not enough time passed", async () => {
        const now = blockchain.now || 0;
        blockchain.now = now + 28944000 - 1; // almost 11 months
        const touchRes = await dnsPack.sendTouch(toucher.getSender(), 0, false);
        expect(touchRes.transactions).toHaveTransaction({
            from: toucher.address,
            to: dnsPack.address,
            op: Op.touch,
            success: false,
            exitCode: Errors.early_touch,
        });
    });
    it("should touch and give reward", async () => {
        const now = blockchain.now || 0;
        blockchain.now = now + 1;
        const touchRes = await dnsPack.sendTouch(toucher.getSender(), 0, false);
        expect(touchRes.transactions).toHaveTransaction({
            from: toucher.address,
            to: dnsPack.address,
            op: Op.touch,
            success: true,
        });
        expect(touchRes.transactions).toHaveTransaction({
            from: dnsPack.address,
            to: dnsItem1.address,
            op: 0,
            success: true,
        });
        expect(touchRes.transactions).toHaveTransaction({
            from: dnsPack.address,
            to: toucher.address,
            op: Op.reward,
            success: true,
            value: (x) => around(x, REWARD),
        });
    });
    it("should not touch if not enough money on balance and full reward", async () => {
        const packContract = await blockchain.getContract(dnsPack.address);
        expect(packContract.balance).toBeLessThan(REWARD);
        const touchRes = await dnsPack.sendTouch(toucher.getSender(), 0, false);
        expect(touchRes.transactions).toHaveTransaction({
            from: toucher.address,
            to: dnsPack.address,
            op: Op.touch,
            success: false,
            exitCode: Errors.not_enough_balance,
        });
    });
    it("should touch with min reward", async () => {
        const touchRes = await dnsPack.sendTouch(toucher.getSender(), 0, true);
        expect(touchRes.transactions).toHaveTransaction({
            from: toucher.address,
            to: dnsPack.address,
            op: Op.touch,
            success: true,
        });
        expect(touchRes.transactions).toHaveTransaction({
            from: dnsPack.address,
            to: toucher.address,
            op: Op.reward,
        });
        printTransactionFees(touchRes.transactions);
    });
    it("should now have minimum balance", async () => {
        // no time pased between last 2 actions ->
        // no storage fees ->
        // exact min_balance on contract
        const packContract = await blockchain.getContract(dnsPack.address);
        expect(packContract.balance).toEqual(MIN_BALANCE);
    });
    it("should not touch if not enough money even for minimum reward", async () => {
        const touchRes = await dnsPack.sendTouch(
            toucher.getSender(),
            0,
            true,
            toNano("0.008")
        );
        expect(touchRes.transactions).toHaveTransaction({
            from: toucher.address,
            to: dnsPack.address,
            success: false,
            exitCode: Errors.not_enough_balance,
        });
    });
    it("should not add domain not from owner", async () => {
        const addResult = await dnsPack.sendAddDomain(
            toucher.getSender(),
            randomAddress()
        );
        expect(addResult.transactions).toHaveTransaction({
            from: toucher.address,
            to: dnsPack.address,
            op: Op.add_domain,
            success: false,
            exitCode: Errors.unauthorized,
        });
    });
    let newOwner: SandboxContract<TreasuryContract>;
    it("should transfer whole pack", async () => {
        newOwner = await blockchain.treasury("newOwner");
        const contractBefore = await blockchain.getContract(dnsPack.address);
        const transferResult = await dnsPack.sendTransfer(
            owner.getSender(),
            newOwner.address,
            owner.address,
            toNano("0.05")
        );
        expect(transferResult.transactions).toHaveTransaction({
            from: owner.address,
            to: dnsPack.address,
            success: true,
            op: Op.transfer,
        });
        expect(transferResult.transactions).toHaveTransaction({
            from: dnsPack.address,
            to: owner.address,
            success: true,
        });
        expect(transferResult.transactions).toHaveTransaction({
            from: dnsPack.address,
            to: newOwner.address,
            op: Op.ownership_assigned,
            value: toNano("0.05"),
            success: true,
        });
        expect(transferResult.transactions).toHaveTransaction({
            from: dnsPack.address,
            to: owner.address,
            op: Op.excesses,
            success: true,
        });
        const contractAfter = await blockchain.getContract(dnsPack.address);
        expect(contractAfter.balance).toEqual(contractBefore.balance);
    });
    it("should give the new owner address", async () => {
        const data = await dnsPack.getNFTData();
        expect(data.owner.equals(newOwner.address)).toBe(true);
    });
    it("should transfer back", async () => {
        await dnsPack.sendTransfer(
            newOwner.getSender(),
            owner.address,
            owner.address,
            toNano("0.05")
        );
        const data = await dnsPack.getNFTData();
        expect(data.owner.equals(owner.address)).toBe(true);
    });
    let deletedIndex: number;
    it("should unpack and transfer a domain", async () => {
        deletedIndex = await dnsPack.getDomainIndex(dnsItem1.address);
        const unpackResult = await dnsPack.sendUnpack(
            owner.getSender(),
            deletedIndex
        );
        expect(unpackResult.transactions).toHaveTransaction({
            from: owner.address,
            to: dnsPack.address,
            op: Op.unpack,
            success: true,
        });
        expect(unpackResult.transactions).toHaveTransaction({
            from: dnsPack.address,
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
    it("should shift other domains by index", async () => {
        const domains = await dnsPack.getDomains();
        expect(domains.get(0)?.domainAddress.equals(dnsItem2.address)).toBe(
            true
        );
        expect(domains.get(1)?.domainAddress.equals(dnsItem3.address)).toBe(
            true
        );
        expect(domains.get(2)).toBe(undefined);
    });
    it("should not unpack not from owner", async () => {
        const domainIndex = await dnsPack.getDomainIndex(dnsItem2.address);
        const unpackResult = await dnsPack.sendUnpack(
            toucher.getSender(),
            domainIndex
        );
        expect(unpackResult.transactions).toHaveTransaction({
            from: toucher.address,
            to: dnsPack.address,
            op: Op.unpack,
            success: false,
            exitCode: Errors.unauthorized,
        });
    });
    it("should not unpack if not enough money", async () => {
        const domainIndex = await dnsPack.getDomainIndex(dnsItem2.address);
        const unpackResultNo = await dnsPack.sendUnpack(
            owner.getSender(),
            domainIndex,
            toNano("0.14") - 1n
        );
        expect(unpackResultNo.transactions).toHaveTransaction({
            from: owner.address,
            to: dnsPack.address,
            op: Op.unpack,
            success: false,
            exitCode: Errors.not_enough_tons,
        });
        const unpackResultOk = await dnsPack.sendUnpack(
            owner.getSender(),
            domainIndex,
            toNano("0.14")
        );
        expect(unpackResultOk.transactions).toHaveTransaction({
            from: owner.address,
            to: dnsPack.address,
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
        const domainsBefore = await dnsPack.getDomains();
        const addResult = await dnsPack.sendAddDomain(
            owner.getSender(),
            dnsItem1.address
        );
        expect(addResult.transactions).toHaveTransaction({
            from: owner.address,
            to: dnsPack.address,
            success: true,
        });
        const domainIndex = await dnsPack.getDomainIndex(dnsItem1.address);
        const unpackResult = await dnsPack.sendUnpack(
            owner.getSender(),
            domainIndex
        );
        expect(unpackResult.transactions).toHaveTransaction({
            from: owner.address,
            to: dnsPack.address,
            op: Op.unpack,
            success: true,
            outMessagesCount: 0,
        });
        const domainsAfter = await dnsPack.getDomains();
        expect(domainsAfter.size).toEqual(domainsBefore.size);
    });
    it("should withdraw all to leave min balance", async () => {});
    it("should not unpack if not enough for filling up min balance", async () => {
        // preparation - touch for leaving min balance
        // and travel in time to spend balance on storage fee
        const now = blockchain.now || 0;
        blockchain.now = now + 28944000;
        const touchRes = await dnsPack.sendTouch(toucher.getSender(), 0, true);
        expect(touchRes.transactions).toHaveTransaction({
            from: toucher.address,
            to: dnsPack.address,
            op: Op.touch,
            success: true,
        });
        const contractAfter1 = await blockchain.getContract(dnsPack.address);
        expect(contractAfter1.balance).toEqual(MIN_BALANCE);
        blockchain.now += 32000000;
        // just inititiate of spending storage fee
        await dnsPack.sendDeploy(owner.getSender(), 1n);
        const contractAfter2 = await blockchain.getContract(dnsPack.address);
        expect(contractAfter2.balance).toBeLessThan(
            MIN_BALANCE - toNano("0.01")
        );

        const domainIndex = await dnsPack.getDomainIndex(dnsItem3.address);
        const unpackResultNo = await dnsPack.sendUnpack(
            owner.getSender(),
            domainIndex,
            toNano("0.14")
        );
        expect(unpackResultNo.transactions).toHaveTransaction({
            from: owner.address,
            to: dnsPack.address,
            op: Op.unpack,
            success: false,
            exitCode: Errors.not_enough_balance,
        });
    });
    it("should unpack if enough for filling", async () => {
        const domainIndex = await dnsPack.getDomainIndex(dnsItem3.address);
        const unpackResult = await dnsPack.sendUnpack(
            owner.getSender(),
            domainIndex,
            toNano("0.16")
        );
        expect(unpackResult.transactions).toHaveTransaction({
            from: owner.address,
            to: dnsPack.address,
            op: Op.unpack,
            success: true,
        });
    });
    // TODO: добавить тест когда денег у контракта много, и чтобы он отправил домогателю ТОЛьКО максимум его 0.36;
    it("should unpack all domains", async () => {
        // preparation - add 2 domains because we've unpacked all of them
        await dnsPack.sendAddDomain(owner.getSender(), dnsItem1.address);
        await dnsPack.sendAddDomain(owner.getSender(), dnsItem2.address);
        await dnsItem1.sendTransfer(
            owner.getSender(),
            dnsPack.address,
            owner.address
        );
        await dnsItem2.sendTransfer(
            owner.getSender(),
            dnsPack.address,
            owner.address
        )
        const domains = await dnsPack.getDomains();
        expect(domains.size).toEqual(2);
        expect(domains.get(0)?.init).toBe(true);
        expect(domains.get(0)?.init).toBe(true);

        const unpackResult = await dnsPack.sendUnpackAll(owner.getSender());
        expect(unpackResult.transactions).toHaveTransaction({
            from: owner.address,
            to: dnsPack.address,
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
            from: dnsPack.address,
            to: owner.address,
            op: Op.excesses,
        });
        const contract = await blockchain.getContract(dnsPack.address);
        expect(contract.balance).toEqual(0n);
    });
});
