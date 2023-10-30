import { Address, Cell, internal, toNano } from "@ton/core";
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
        const addr = Address.parse(await ui.input("Address:"));
        const amount = toNano(await ui.input("Amount:"));
        const bodyString = await ui.input(
            "Message Body HEX (Enter for no body):"
        );
        const body = bodyString
            ? Cell.fromBoc(Buffer.from(bodyString, "hex"))[0]
            : undefined;
        msgs.push({
            at: i,
            message: internal({
                to: addr,
                bounce: false,
                body,
                value: amount,
            }),
        });
        cont = await promptBool(
            "Add another message? [Enter/n]",
            ["", "n"],
            ui
        );
        i += 1;
    }

    await bundle.sendMessages(provider.sender(), msgs);
    const succ = await waitForTransaction(provider, bundle.address, 10);
    if (!succ) {
        ui.write("Failed to send");
        return;
    } else ui.write("Succesfully sent the send request");
}
