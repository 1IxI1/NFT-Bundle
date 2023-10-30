import { Address, fromNano, toNano } from "@ton/core";
import { Bundle } from "../wrappers/Bundle";
import { NetworkProvider } from "@ton/blueprint";
import { promptBool, waitForTransaction } from "./ui-utils";

export async function run(provider: NetworkProvider, args: string[]) {
    const ui = provider.ui();
    const toucherAddress = provider.sender().address;
    const testnet = provider.network() == "testnet";

    if (!Address.isAddress(toucherAddress)) {
        throw new Error("No toucher address");
    }

    const bundleAddress = Address.parse(
        args.length > 0 ? args[0] : await ui.input("Bundle address")
    );

    const bundle = provider.open(Bundle.createFromAddress(bundleAddress));

    const actions = await bundle.getScheduledActions();
    if (!actions) {
        ui.write("No scheduled actions");
        return;
    }
    const timers = actions.keys;
    const minKey = Math.max.apply(timers);
    const now = Math.floor(Date.now() / 1000);
    if (now < minKey) {
        ui.write("No avaliable actions");
        ui.write(
            `The next action will be avaliable at ${minKey}, in ${
                minKey - now
            } seconds`
        );
        return;
    }

    const { reward, fee } = await bundle.getTouchRewardAndFee();

    ui.write(`There are avaliable actions to trigger!`);
    ui.write(`Your expected reward: ${fromNano(reward)} TON`);
    ui.write(`Expected fee (cost): ${fromNano(fee)} TON`);

    const ensuring = await promptBool(
        "Set the ensuring key? It will revert the touch if someone will frontrun you [y/n]",
        ["y", "n"],
        ui
    );

    await bundle.sendTouch(
        provider.sender(),
        toNano("0.5"),
        ensuring ? minKey : undefined
    );

    let touchSucc = await waitForTransaction(provider, bundle.address, 10);

    if (!touchSucc) {
        ui.write("Failed to send the touch");
        return;
    } else {
        ui.write("Succesfully sent touch. Watch the result here: ");
        ui.write(
            `https://${testnet ? "testnet." : ""}ton.cx/address/` +
                bundle.address.toString()
        );
    }
}
