import { Address, internal, toNano } from "@ton/core";
import { Bundle, ScheduledMessage } from "../wrappers/Bundle";
import { NetworkProvider } from "@ton/blueprint";
import { waitForTransaction } from "./ui-utils";

export async function run(provider: NetworkProvider, args: string[]) {
    const ui = provider.ui();
    const senderAddress = provider.sender().address;

    if (!Address.isAddress(senderAddress)) {
        throw new Error("No sender address");
    }

    const bundleAddress = Address.parse(
        args.length > 0 ? args[0] : await ui.input("Bundle address")
    );

    const bundle = provider.open(Bundle.createFromAddress(bundleAddress));

    const itemAddresses = (
        args.length > 3
            ? args[3]
            : await ui.input("NFT prize addresses (separrated by comma)")
    )
        .split(",")
        .map((addr) => Address.parse(addr));

    let msgs: ScheduledMessage[] = [];
    for (let itemAddr of itemAddresses) {
        const item = provider.open(Bundle.createFromAddress(itemAddr));
        const owner = await item.getOwnerAddress();
        if (!owner.equals(bundleAddress)) {
            ui.write("Bundle is not the owner of item " + itemAddr.toString());
            return;
        }
        msgs.push({
            at: msgs.length,
            message: internal({
                to: itemAddr,
                value: toNano("0.1"),
                body: Bundle.transferMessage(senderAddress, senderAddress),
            }),
        });
    }

    await bundle.sendMessages(provider.sender(), msgs);

    let changeSucc = await waitForTransaction(provider, itemAddresses[0], 10);

    if (!changeSucc) {
        ui.write(
            "Failed to unpack items. Can not find the message on NFT side."
        );
        return;
    } else ui.write("Unpack was successfully completed.");
}
