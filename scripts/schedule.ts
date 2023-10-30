import { Address, internal, toNano } from "@ton/core";
import { Bundle, ScheduledMessage } from "../wrappers/Bundle";
import { NetworkProvider } from "@ton/blueprint";
import { promptBool, waitForTransaction } from "./ui-utils";

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

    let msgs: ScheduledMessage[] = [];

    let i = 1;
    let cont = true;
    while (cont) {
        ui.write(`\n\nMessage #${i}`);
        const time = Number(await ui.input("Send at:"));
        const addr = Address.parse(await ui.input("Item address:"));
        msgs.push({
            at: time,
            message: internal({
                to: addr,
                bounce: false,
                value: toNano("0.005"),
            }),
        });
        cont = await promptBool(
            "Add another message? [Enter/n]",
            ["", "n"],
            ui
        );
        i += 1;
    }

    await bundle.sendSchedule(provider.sender(), msgs);
    const succ = await waitForTransaction(provider, bundle.address, 10);
    if (!succ) {
        ui.write("Failed to schedule");
        return;
    } else ui.write("Succesfully sent schedule request");
}
