import { Address, fromNano, toNano } from "@ton/core";
import { Bundle } from "../wrappers/Bundle";
import { NetworkProvider } from "@ton/blueprint";

const MIN_BALANCE = toNano("0.05");

export async function run(provider: NetworkProvider, args: string[]) {
    const ui = provider.ui();
    const ownerAddress = provider.sender().address;

    if (!Address.isAddress(ownerAddress)) {
        throw new Error("No owner address");
    }

    const bundleAddress = Address.parse(
        args.length > 0 ? args[0] : await ui.input("Bundle address")
    );

    const bundle = provider.open(Bundle.createFromAddress(bundleAddress));

    const items = await bundle.getCollectibles();
    const touchPeriod = await bundle.getTouchPeriod();
    const touchReward = await bundle.getMaxReward();

    let totalReward = 0n;
    const now = Math.floor(Date.now() / 1000);
    for (let i = 0; i < items.size; i++) {
        const item = items.get(i)!;
        const canTouchAt = item.lastTouched + touchPeriod;
        if (canTouchAt < now && item.lastTouched !== 0) {
            ui.write(
                `${i} - ${item.itemAddress.toString()} can be touched (max reward: ${fromNano(
                    touchReward
                )} TON)`
            );
            totalReward += touchReward;
        }
    }
    const { last } = await provider.api().getLastBlock();
    const { account } = await provider
        .api()
        .getAccount(last.seqno, bundleAddress);
    ui.write(`\nTotal maximum reward: ${fromNano(totalReward)} TON`);
    ui.write(`Bundle balance: ${fromNano(account.balance.coins)} TON`);
    const avaliable = BigInt(account.balance.coins) - MIN_BALANCE;
    const enough = avaliable >= totalReward;
    ui.write(
        `Avaliable for touch rewards: ${avaliable}/${fromNano(
            totalReward
        )} TON - ${enough ? "Enough" : "Not enough"}`
    );
}
