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
            success: true,
            op: Op.ownership_assigned,
        });
    });
    it("should give the new owner address", async () => {
        const data = await dnsPack.getNFTData();
        expect(data.owner.equals(newOwner.address)).toBe(true);
    });
    // TODO: tests for unpacking
});
