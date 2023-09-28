import { Address, Cell, fromNano, toNano } from "@ton/core";
import { Bundle, MIN_BALANCE } from "../wrappers/Bundle";
import { NetworkProvider } from "@ton/blueprint";
import { promptAddressOrIndex, waitForTransaction } from "./ui-utils";

export async function run(provider: NetworkProvider, args: string[]) {
    const ui = provider.ui();
    const ownerAddress = provider.sender().address;

    if (!Address.isAddress(ownerAddress)) {
        throw new Error("No owner address");
    }

    const bundleAddress = Address.parse(
        args.length > 0 ? args[0] : await ui.input("Bundle address")
    );
    const itemAddressOrIndex = await promptAddressOrIndex(ui);

    const bundle = provider.open(Bundle.createFromAddress(bundleAddress));

    const itemIndex =
        itemAddressOrIndex instanceof Address
            ? await bundle.getCollectibleIndex(itemAddressOrIndex)
            : itemAddressOrIndex;
    if (itemIndex < 0) {
        ui.write("Item is not in the bundle");
        return;
    }
    const itemsBefore = await bundle.getCollectibles();
    const itemBefore = itemsBefore.get(itemIndex);

    if (!itemBefore?.init) {
        ui.write("Item is not initialized");
        return;
    }
    const touchPeriod = await bundle.getTouchPeriod();
    const touchReward = await bundle.getMaxReward();
    const now = Math.floor(Date.now() / 1000);

    if (itemBefore.lastTouched + touchPeriod > now) {
        ui.write("Too early for touch");
        return;
    }

    let allow_min_reward = false;
    const touchGas = await bundle.getTouchGas();
    const { last } = await provider.api().getLastBlock();
    const { account } = await provider
        .api()
        .getAccount(last.seqno, bundleAddress);
    const rest = BigInt(account.balance.coins) - MIN_BALANCE;
    if (rest < touchReward) {
        if (rest >= touchGas) {
            const ans = await ui.input(
                "There is only " +
                    fromNano(rest - touchGas) +
                    " TON left to be given as reward. Continue with getting it? (no/yes)"
            );
            if (ans === "yes") allow_min_reward = true;
            else return;
        } else {
            ui.write("The contract balance is not enough to pay any reward.");
            return;
        }
    }

    await bundle.sendTouch(provider.sender(), itemIndex, allow_min_reward);
    let touchSucc = await waitForTransaction(
        provider,
        itemBefore.itemAddress,
        10
    );

    const itemsAfter = await bundle.getCollectibles();
    const itemAfter = itemsAfter.get(itemIndex);
    if (!itemAfter) {
        ui.write("Something went wrong. Item has disappeared.");
        return;
    }
    touchSucc =
        touchSucc && // also check for lastTouched increase
        itemAfter.lastTouched > itemBefore.lastTouched;

    if (!touchSucc) {
        ui.write("Failed to touch");
        return;
    } else ui.write("Succesfully touched the item");
}
